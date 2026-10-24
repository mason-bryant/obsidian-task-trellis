#!/usr/bin/env python3
"""Build the unsigned iOS capture shortcut; sign using `shortcuts sign --mode anyone`.

Wire formats were checked against exported Shortcuts, in particular URL Encode's
WFInput and Format Date's WFDate, which require WFTextTokenString (not a bare
WFTextTokenAttachment). Signing validates distribution, not runtime behavior.
"""
import argparse
import plistlib
import uuid
from pathlib import Path


def attachment(value):
    return {'WFSerializationType': 'WFTextTokenAttachment', 'Value': value}


def text(*parts):
    string = ''
    ranges = {}
    for part in parts:
        if isinstance(part, dict):
            offset = len(string.encode('utf-16-le')) // 2
            ranges[f'{{{offset}, 1}}'] = part
            string += '\ufffc'
        else:
            string += part
    return {'WFSerializationType': 'WFTextTokenString',
            'Value': {'string': string, 'attachmentsByRange': ranges}}


def build(vault_name=None, board_name=None, preview=False):
    actions = []

    def action(name, **params):
        ident = str(uuid.uuid4()).upper()
        params['UUID'] = ident
        actions.append({'WFWorkflowActionIdentifier': 'is.workflow.actions.' + name,
                        'WFWorkflowActionParameters': params})
        return {'Type': 'ActionOutput', 'OutputUUID': ident,
                'OutputName': params.get('CustomOutputName', name)}

    def encode(value):
        return action('urlencode', WFEncodeMode='Encode', WFInput=text(value))

    def setting(label, configured, instruction):
        if configured is not None and not configured.strip():
            raise ValueError('Configured vault and board must not be blank.')
        action('comment', WFCommentActionText=f'{label.upper()} — {instruction}')
        return action('gettext', WFTextActionText=(configured or '').strip(),
                      CustomOutputName=label)

    vault_value = setting('Vault', vault_name,
        'Enter your exact iPhone vault name in the Text box below. '
        'Set these two boxes once, then rename this shortcut for the destination.')
    board_value = setting('Board', board_name,
        'Enter the board name or unique slug in the Text box below. '
        'Duplicate this shortcut and change these two boxes for another destination.')

    def require_setting(value, label):
        group = str(uuid.uuid4()).upper()
        action('conditional', WFCondition=101, WFControlFlowMode=0,
               GroupingIdentifier=group,
               WFInput={'Type': 'Variable', 'Variable': attachment(value)})
        action('alert', WFAlertActionTitle='Set up this shortcut once',
               WFAlertActionMessage=f'Tap the three dots on this shortcut in Shortcuts. '
                   f'Fill in the {label} Text box at the top, then tap Done. '
                   'The vault and board are saved in this copy of the shortcut.',
               WFAlertActionCancelButtonShown=False)
        action('exit')
        action('conditional', WFControlFlowMode=2, GroupingIdentifier=group)

    require_setting(vault_value, 'Vault')
    require_setting(board_value, 'Board')
    vault = encode(vault_value)
    board = encode(board_value)
    task = encode(action('ask', WFAskActionPrompt='What needs doing?',
                         WFInputType='Text', WFAllowsMultilineText=False))
    base = ['obsidian://task-trellis-create?vault=', vault, '&board=', board,
            '&text=', task, '&open-board=true']
    group = str(uuid.uuid4()).upper()
    action('choosefrommenu', WFMenuPrompt='Due date',
           WFMenuItems=['No due date', 'Choose date'],
           GroupingIdentifier=group, WFControlFlowMode=0)
    action('choosefrommenu', WFMenuItemTitle='No due date',
           GroupingIdentifier=group, WFControlFlowMode=1)
    action('gettext', WFTextActionText=text(*base))
    action('choosefrommenu', WFMenuItemTitle='Choose date',
           GroupingIdentifier=group, WFControlFlowMode=1)
    date = action('ask', WFAskActionPrompt='When is it due?', WFInputType='Date')
    formatted = action('format.date', WFDateFormatStyle='Custom',
                       WFDateFormat='yyyy-MM-dd', WFDate=text(date))
    action('gettext', WFTextActionText=text(*base, '&due=', formatted))
    result = action('choosefrommenu', GroupingIdentifier=group, WFControlFlowMode=2)
    if preview:
        action('showresult', Text=text('Ready to send to Obsidian:\n\n', result,
               '\n\nTap Done to create the task. Keep Obsidian open until sync finishes.'))
    action('openurl', WFInput=attachment(result))
    return {
        'WFWorkflowName': 'Create Task Trellis Task',
        'WFWorkflowClientVersion': '2600.0.0',
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowIcon': {'WFWorkflowIconStartColor': 2071128575,
                           'WFWorkflowIconGlyphNumber': 59511},
        'WFWorkflowTypes': [], 'WFWorkflowInputContentItemClasses': [],
        'WFWorkflowActions': actions,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--vault', help='Preconfigure the saved Vault field; otherwise leave it for the user to fill once.')
    parser.add_argument('--board', help='Preconfigure the saved Board field; otherwise leave it for the user to fill once.')
    parser.add_argument('--preview', action='store_true', help='Show the outgoing link before opening Obsidian.')
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(plistlib.dumps(build(args.vault, args.board, args.preview), fmt=plistlib.FMT_BINARY))
    print(f'Wrote {args.output}')
