"""Serialized artifact checks; these do not replace native iPhone execution."""
import copy
import importlib.util
import plistlib
from pathlib import Path
import unittest
from urllib.parse import parse_qs, quote, urlsplit

spec = importlib.util.spec_from_file_location('ios_shortcut', Path(__file__).parents[1] / 'scripts/build-ios-shortcut.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def artifact(*args, **kwargs):
    return plistlib.loads(plistlib.dumps(module.build(*args, **kwargs), fmt=plistlib.FMT_BINARY))


def configure(wf, **settings):
    for action in wf['WFWorkflowActions']:
        p = action['WFWorkflowActionParameters']
        if p.get('CustomOutputName') in settings:
            p['WFTextActionText'] = settings[p['CustomOutputName']]


class ShortcutArtifactTests(unittest.TestCase):
    def evaluate(self, wf, due=None, task='Buy milk & bread #home + 50%'):
        values = {}
        selected = 'Choose date' if due else 'No due date'
        active = True
        branch_result = None
        result = {'opened': None, 'preview': None, 'alert': None, 'asks': []}

        def resolve(value):
            if isinstance(value, str):
                return value
            self.assertEqual(value['WFSerializationType'], 'WFTextTokenString')
            body = value['Value']
            raw = body['string'].encode('utf-16-le')
            for key, ref in sorted(body['attachmentsByRange'].items(), key=lambda pair: int(pair[0][1:].split(',')[0]), reverse=True):
                offset = int(key[1:].split(',')[0]) * 2
                self.assertEqual(raw[offset:offset+2], '\ufffc'.encode('utf-16-le'))
                raw = raw[:offset] + values[ref['OutputUUID']].encode('utf-16-le') + raw[offset+2:]
            return raw.decode('utf-16-le')

        for action in wf['WFWorkflowActions']:
            name = action['WFWorkflowActionIdentifier'].removeprefix('is.workflow.actions.')
            p = action['WFWorkflowActionParameters']
            if name == 'conditional':
                if p['WFControlFlowMode'] == 0:
                    self.assertEqual(p['WFCondition'], 101)
                    self.assertEqual(p['WFInput']['Type'], 'Variable')
                    ref = p['WFInput']['Variable']
                    self.assertEqual(ref['WFSerializationType'], 'WFTextTokenAttachment')
                    active = not values[ref['Value']['OutputUUID']]
                else:
                    active = True
                continue
            if name == 'choosefrommenu':
                mode = p['WFControlFlowMode']
                if mode == 1:
                    active = p['WFMenuItemTitle'] == selected
                elif mode == 2:
                    active = True
                    values[p['UUID']] = branch_result
                continue
            if not active or name == 'comment':
                continue
            if name == 'gettext':
                value = resolve(p['WFTextActionText'])
                branch_result = value
            elif name == 'ask':
                result['asks'].append(p['WFAskActionPrompt'])
                value = due if p['WFInputType'] == 'Date' else task
            elif name == 'urlencode':
                # URL Encode requires a text slot, not a bare attachment.
                value = quote(resolve(p['WFInput']), safe='')
            elif name == 'format.date':
                self.assertEqual(p['WFDateFormat'], 'yyyy-MM-dd')
                self.assertEqual(p['WFDateFormatStyle'], 'Custom')
                value = resolve(p['WFDate'])
            elif name == 'showresult':
                value = result['preview'] = resolve(p['Text'])
            elif name == 'openurl':
                self.assertEqual(p['WFInput']['WFSerializationType'], 'WFTextTokenAttachment')
                value = result['opened'] = values[p['WFInput']['Value']['OutputUUID']]
            elif name == 'alert':
                value = result['alert'] = p['WFAlertActionMessage']
            elif name == 'exit':
                return result
            else:
                self.fail('Unexpected native action: ' + name)
            values[p['UUID']] = value
        return result

    def check_capture(self, due, preview=False):
        vault, board = 'Home & Work + café', 'Projects #1 / 🏠'
        wf = artifact(preview=preview)
        configure(wf, Vault=vault, Board=board)
        result = self.evaluate(wf, due)
        url = urlsplit(result['opened'])
        self.assertEqual((url.scheme, url.netloc), ('obsidian', 'task-trellis-create'))
        expected = {'vault': [vault], 'board': [board],
                    'text': ['Buy milk & bread #home + 50%'], 'open-board': ['true']}
        if due:
            expected['due'] = [due]
        self.assertEqual(parse_qs(url.query), expected)
        if preview:
            self.assertIn(result['opened'], result['preview'])
        else:
            self.assertIsNone(result['preview'])
        self.assertEqual(result['asks'], ['What needs doing?'] + (['When is it due?'] if due else []))

    def test_undated_capture_after_user_configures_destination(self):
        self.check_capture(None)

    def test_dated_capture_after_user_configures_destination(self):
        self.check_capture('2026-10-30')

    def test_preview_preserves_link(self):
        self.check_capture(None, preview=True)

    def test_missing_destination_stops_before_task_prompt_or_opening_obsidian(self):
        for settings, missing in [({}, 'Vault'), ({'Vault': 'Home'}, 'Board'), ({'Board': 'Projects'}, 'Vault')]:
            wf = artifact()
            configure(wf, **settings)
            result = self.evaluate(wf)
            self.assertIn(f'{missing} Text box', result['alert'])
            self.assertIsNone(result['opened'])
            self.assertEqual(result['asks'], [])

    def test_saved_settings_survive_repeated_runs_and_duplicate_independently(self):
        original = artifact()
        configure(original, Vault='Home', Board='Projects')
        duplicate = copy.deepcopy(original)
        configure(duplicate, Vault='Work', Board='Team')
        for _ in range(2):
            for wf, vault, board in [(original, 'Home', 'Projects'), (duplicate, 'Work', 'Team')]:
                result = self.evaluate(wf)
                params = parse_qs(urlsplit(result['opened']).query)
                self.assertEqual(params['vault'], [vault])
                self.assertEqual(params['board'], [board])
                self.assertEqual(result['asks'], ['What needs doing?'])

    def test_template_contains_two_adjacent_configuration_boxes_and_no_import_questions(self):
        wf = artifact()
        self.assertNotIn('WFWorkflowImportQuestions', wf)
        first = wf['WFWorkflowActions'][:4]
        self.assertEqual([a['WFWorkflowActionIdentifier'].split('.')[-1] for a in first],
                         ['comment', 'gettext', 'comment', 'gettext'])
        self.assertEqual(first[1]['WFWorkflowActionParameters']['CustomOutputName'], 'Vault')
        self.assertEqual(first[3]['WFWorkflowActionParameters']['CustomOutputName'], 'Board')
        self.assertEqual(first[1]['WFWorkflowActionParameters']['WFTextActionText'], '')
        self.assertEqual(first[3]['WFWorkflowActionParameters']['WFTextActionText'], '')
        serialized = plistlib.dumps(wf).decode()
        self.assertNotIn('Mason Remote', serialized)
        self.assertNotIn('Personal Projects', serialized)

    def test_preconfigured_download_uses_same_capture_flow(self):
        result = self.evaluate(artifact('Home', 'Projects'))
        self.assertEqual(parse_qs(urlsplit(result['opened']).query)['board'], ['Projects'])
        self.assertEqual(result['asks'], ['What needs doing?'])

    def test_blank_build_arguments_are_rejected(self):
        with self.assertRaises(ValueError):
            artifact(' ', 'Projects')
        with self.assertRaises(ValueError):
            artifact('Home', '')


if __name__ == '__main__':
    unittest.main()
