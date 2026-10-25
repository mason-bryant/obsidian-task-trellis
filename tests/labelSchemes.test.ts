import { describe, expect, it } from 'vitest';
import { applyLabelScheme, LABEL_SCHEMES, parsePreviousScheme } from '../src/core/labelSchemes.ts';
import { defaultLabels } from '../src/core/labels.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';

describe('board label schemes', () => {
  it('offers exactly the approved ten schemes plus Trellis', () => {
    expect(LABEL_SCHEMES.map(s => s.id)).toEqual(['trellis', 'tableau-balanced', 'tableau-classic', 'botanical', 'mediterranean', 'retro-pop', 'jewel-box', 'neon-studio', 'sorbet', 'velvet', 'modern-primary']);
    for (const s of LABEL_SCHEMES) {
      expect(s.colors).toHaveLength(6);
      for (const color of s.colors) expect(color).toMatch(/^#[a-f0-9]{6}$/);
    }
    expect(LABEL_SCHEMES.find(s => s.id === 'sorbet')!.colors).toEqual(['#8fc9b0','#c5d68d','#f1d286','#f2ae94','#d9a4c2','#a7bce3']);
  });
  it('preserves label identities/names and restores exact custom colors across serialization', () => {
    const labels = defaultLabels(); labels[0] = { id: 'custom1', name: 'Finance', color: '#123456' };
    const next = applyLabelScheme({ labels, previous: {} }, 'botanical');
    expect(next.labels.map(l=>[l.id,l.name])).toEqual(labels.map(l=>[l.id,l.name]));
    expect(labels[0]!.color).toBe('#123456');
    const restoredConfig = parseBoardConfig('Test', JSON.parse(JSON.stringify({labels:next.labels, 'previous-label-scheme':next.previous}))).config;
    const restored = applyLabelScheme({labels:restoredConfig.labels,previous:restoredConfig.previousLabelScheme},'previous');
    expect(restored.labels).toEqual(labels);
    expect(applyLabelScheme(restored,'previous').labels).toEqual(next.labels);
  });
  it('follows renamed/reordered labels, leaves new labels alone and never recreates deleted labels', () => {
    const state = applyLabelScheme({labels:defaultLabels(),previous:{}},'neon-studio');
    state.labels = [ {...state.labels[3]!,name:'Renamed'}, {id:'new1',name:'New',color:'#012345'} ];
    const restored = applyLabelScheme(state,'previous');
    expect(restored.labels).toEqual([{id:'red',name:'Renamed',color:'#ae2e24'},{id:'new1',name:'New',color:'#012345'}]);
  });
  it('keeps the previous snapshot for unchanged selections and empty boards', () => {
    const state = applyLabelScheme({labels:defaultLabels(),previous:{}},'velvet');
    expect(applyLabelScheme(state,'velvet')).toBe(state);
    const empty = {labels:[],previous:{old:'#ffffff'}};
    expect(applyLabelScheme(empty,'trellis')).toBe(empty);
  });
  it('cycles colors for extra labels and ignores invalid snapshot data', () => {
    const labels = [...defaultLabels(), {id:'extra',name:'Extra',color:'#000000'}];
    const next = applyLabelScheme({labels,previous:{}},'sorbet');
    expect(next.labels[6]!.color).toBe(next.labels[0]!.color);
    expect(parsePreviousScheme({a:'#ABC',b:'red',c:7})).toEqual({a:'#aabbcc'});
    expect(parsePreviousScheme([])).toEqual({});
    expect(()=>applyLabelScheme(next,'bad')).toThrow('Unknown color scheme');
  });
});
