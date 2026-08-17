import fs from 'node:fs';
import vm from 'node:vm';

class FakeNode {
  constructor(tagName) {
    this.tagName = String(tagName || '').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.id = '';
    this.textContent = '';
    this.innerHTML = '';
    this.attributes = {};
    this.style = {};
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  insertBefore(node, reference) {
    node.parentNode = this;
    const at = this.children.indexOf(reference);
    if (at < 0) this.children.push(node);
    else this.children.splice(at, 0, node);
    return node;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
  }

  getAttribute(name) {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  get classList() {
    const node = this;
    function tokens() {
      return String(node.className || '').split(/\s+/).filter(Boolean);
    }
    function write(list) {
      node.className = Array.from(new Set(list)).join(' ');
    }
    return {
      contains(name) { return tokens().includes(name); },
      add(name) { const list = tokens(); if (!list.includes(name)) list.push(name); write(list); },
      remove(name) { write(tokens().filter((item) => item !== name)); }
    };
  }
}

function walk(root, predicate) {
  if (!root) return null;
  if (predicate(root)) return root;
  for (const child of root.children || []) {
    const found = walk(child, predicate);
    if (found) return found;
  }
  return null;
}

const head = new FakeNode('head');
const body = new FakeNode('body');
const documentElement = new FakeNode('html');
const mom = new FakeNode('section');
mom.id = 'momHome';
mom.className = 'mom-home';
const approval = new FakeNode('div');
approval.id = 'momApproval';
approval.className = 'approval hidden';
const content = new FakeNode('div');
content.id = 'momContent';
content.className = 'mom-content';
mom.appendChild(approval);
mom.appendChild(content);
body.appendChild(mom);

const document = {
  readyState: 'loading',
  head,
  body,
  documentElement,
  title: '',
  createElement(tagName) { return new FakeNode(tagName); },
  createTextNode(text) { const node = new FakeNode('#text'); node.textContent = String(text); return node; },
  getElementById(id) {
    return walk(head, (node) => node.id === id) || walk(body, (node) => node.id === id);
  },
  querySelector(selector) {
    if (selector === '.home-brand') return null;
    if (selector === '.mom-title') return null;
    if (selector[0] === '#') return this.getElementById(selector.slice(1));
    if (selector[0] === '.') {
      const name = selector.slice(1);
      return walk(body, (node) => node.classList && node.classList.contains(name));
    }
    return null;
  },
  addEventListener() {}
};

const storage = {};
const context = {
  window: {},
  document,
  localStorage: {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
    setItem(key, value) { storage[key] = String(value); },
    removeItem(key) { delete storage[key]; }
  },
  fetch() { return Promise.reject(new Error('network disabled in unit test')); },
  Promise,
  Date,
  Math,
  Array,
  String,
  Number,
  Object,
  Error,
  setTimeout() { return 1; },
  clearTimeout() {},
  MutationObserver: undefined,
  console
};
context.window = context;

const source = fs.readFileSync('app/brand-runtime.js', 'utf8');
vm.runInNewContext(source, context, { filename: 'brand-runtime.js' });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(context.SuniTVMomExtras, 'SuniTVMomExtras API must be exported');
assert(typeof context.SuniTVMomExtras.apply === 'function', 'Mom extras apply API missing');

const malicious = '<img src=x onerror=alert(1)>';
context.SuniTVMomExtras.apply({
  mom_message: {
    quote: { title: '오늘의 한마디', text: malicious, attribution: '가족' },
    ticker: [{ text: '첫 메시지' }, { text: '둘째 메시지' }]
  }
});

const quote = document.getElementById('momDailyQuote');
const quoteText = document.getElementById('momDailyQuoteText');
const quoteBy = document.getElementById('momDailyQuoteBy');
const ticker = document.getElementById('momTicker');
const tickerTrack = document.getElementById('momTickerTrack');

assert(quote && !quote.classList.contains('hidden'), 'daily quote must be visible for an approved Mom Home');
assert(quoteText.textContent === malicious, 'quote must be assigned as textContent without HTML parsing');
assert(quoteBy.textContent === '가족', 'quote attribution must render');
assert(ticker && !ticker.classList.contains('hidden'), 'ticker must be visible when messages exist');
assert(tickerTrack.textContent.includes('첫 메시지') && tickerTrack.textContent.includes('둘째 메시지'), 'ticker must include every server message');
assert(mom.classList.contains('mom-extras-active'), 'Mom Home must reserve layout space for extras');

context.SuniTVMomExtras.apply({ mom_message: { ticker: [] } });
assert(!quote.classList.contains('hidden'), 'fallback daily quote must remain visible when server quote is absent');
assert(quoteText.textContent.length > 0, 'fallback quote must not be blank');
assert(ticker.classList.contains('hidden'), 'empty ticker must be hidden');

const q1 = context.SuniTVMomExtras.fallbackQuote();
const q2 = context.SuniTVMomExtras.fallbackQuote();
assert(q1.text === q2.text, 'fallback quote must be deterministic for the same local day');

content.classList.add('hidden');
context.SuniTVMomExtras.apply({ mom_message: { quote: { text: '숨김 테스트' }, ticker: ['숨김'] } });
assert(quote.classList.contains('hidden'), 'quote must hide while device approval/content is unavailable');
assert(ticker.classList.contains('hidden'), 'ticker must hide while device approval/content is unavailable');
assert(!mom.classList.contains('mom-extras-active'), 'layout reservation must clear when approval content is hidden');

console.log('Mom extras runtime tests: PASS');
