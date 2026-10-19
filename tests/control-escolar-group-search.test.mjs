import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
const source = readFileSync(new URL('../pages/control-escolar.vue', import.meta.url), 'utf8');
function fixture() {
  const writes = [];
  let saved = 'OCEANÍA';
  const context = createContext({
    ref: value => ({ value }),
    computed: definition => ({ get value() { return typeof definition === 'function' ? definition() : definition.get(); }, set value(v) { definition.set(v); } }),
    editForm: { grupo: saved }, selectedStudent: { value: { matricula: 'TEST' } },
    normalizeGroupPickerText: value => String(value ?? '').trim().toUpperCase(),
    normalizeClientText: value => String(value ?? '').trim().toLowerCase(),
    parseEditSnapshot: () => ({ grupo: saved }), persistEditDraft() {},
    queueGroupAutosave: (_, value) => { writes.push(value); saved = value; },
    process: { client: true }, window: { setTimeout() {} }, nextTick() {},
  });
  const block = source.slice(source.indexOf('const groupPickerOpen ='), source.indexOf('\nwatch(', source.indexOf('const groupPickerOpen =')));
  runInContext(block + '\nglobalThis.picker = { groupPickerInput, clearGroupPicker, closeGroupPickerSoon, selectGroupOption, commitGroupPickerInput, groupModalPickerInput, clearGroupModalPicker, confirmGroupModal, commitSelectedGroupChange };', context);
  return { context, picker: context.picker, writes };
}
test('clearing and typing search never changes saved group, including blur', () => {
  const { context, picker, writes } = fixture();
  picker.groupPickerInput.value = 'AF'; picker.clearGroupPicker(); picker.closeGroupPickerSoon({});
  assert.equal(context.editForm.grupo, 'OCEANÍA'); assert.deepEqual(writes, []);
  picker.groupPickerInput.value = 'AF'; picker.closeGroupPickerSoon({});
  assert.deepEqual(writes, []);
});
test('clear search then select sends only final group; empty Enter is harmless', () => {
  const { picker, writes } = fixture();
  picker.clearGroupPicker(); picker.commitGroupPickerInput(); picker.selectGroupOption('ÁFRICA');
  assert.deepEqual(writes, ['ÁFRICA']);
});
test('custom group still commits explicitly and group removal remains explicit', () => {
  const { picker, writes } = fixture();
  picker.groupPickerInput.value = 'nuevo'; picker.commitGroupPickerInput();
  picker.commitSelectedGroupChange(''); assert.deepEqual(writes, ['NUEVO', '']);
});
test('modal clear and empty save never remove group; selection still saves', () => {
  const { picker, writes } = fixture();
  picker.clearGroupModalPicker(); picker.confirmGroupModal(); assert.deepEqual(writes, []);
  picker.groupModalPickerInput.value = 'ÁFRICA'; picker.confirmGroupModal();
  assert.deepEqual(writes, ['ÁFRICA']);
});
