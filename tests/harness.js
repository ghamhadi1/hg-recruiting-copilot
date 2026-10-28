// Runs an n8n Code-node file outside n8n with fake $input / $('Node') data.
const fs = require('fs');
const path = require('path');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function items(list) {
  return (list || []).map(x => (x && x.json !== undefined ? x : { json: x }));
}

function accessor(list) {
  const arr = items(list);
  return {
    all: () => arr,
    first: () => arr[0],
    get item() { return arr[0]; },
    itemMatching: i => arr[i]
  };
}

async function runCode(file, opts) {
  opts = opts || {};
  const src = fs.readFileSync(path.join(__dirname, '..', 'n8n', 'src', 'code', file + '.js'), 'utf8');
  const nodes = opts.nodes || {};
  const $ = name => {
    if (!(name in nodes)) throw new Error('Referenced node is unexecuted: ' + name);
    return accessor(nodes[name]);
  };
  const input = accessor(opts.input || []);
  const fn = new AsyncFunction('$', '$input', '$json', 'Buffer', src);
  const first = input.first();
  return fn.call({ helpers: opts.helpers || {} }, $, input, first ? first.json : {}, Buffer);
}

module.exports = { runCode };
