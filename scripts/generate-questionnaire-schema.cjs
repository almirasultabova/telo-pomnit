// Run after changing the existing questionnaire fields; no DB or network access.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/js/app.js'), 'utf8');
const match = source.match(/const Q_BLOCKS = (\[[\s\S]*?\n\]);/);
if (!match) throw new Error('Questionnaire fields not found');
const blocks = vm.runInNewContext(match[1]);
const schema = { type: 'object', required: [], additionalProperties: false, properties: {} };
for (const field of blocks.flatMap(block => block.fields)) {
  let rule;
  if (field.type === 'checkbox') rule = { type: 'array', uniqueItems: true, maxItems: field.options.length, items: { type: 'string', enum: field.options } };
  else if (field.type === 'radio') rule = { type: 'string', enum: field.required ? field.options : ['', ...field.options] };
  else if (field.type === 'scale') rule = { type: 'integer', minimum: field.min, maximum: field.max };
  else rule = { type: 'string', maxLength: 4000, ...(field.required ? { pattern: '\\S' } : {}) };
  schema.properties[field.id] = rule;
  if (field.required) schema.required.push(field.id);
}
fs.writeFileSync(path.join(root, 'backend/src/questionnaire-pre-schema.json'), JSON.stringify(schema, null, 2) + '\n');
console.log('Questionnaire v1: ' + Object.keys(schema.properties).length + ' fields, ' + schema.required.length + ' required');
