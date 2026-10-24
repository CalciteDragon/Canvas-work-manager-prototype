import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectEvidence } from './evidence.mjs';
import { JSDOM } from 'jsdom';
import { collectControls, collectPlaneBoxes } from './layout.mjs';
import * as layout from './layout.mjs';

test('layout evidence records plane containers keyed by selector and index', () => {
  const { document } = new JSDOM('<app-top-bar></app-top-bar><app-project-section-frame></app-project-section-frame><app-project-section-frame></app-project-section-frame>').window;
  for (const element of document.querySelectorAll('*')) element.getBoundingClientRect = () => ({ x: 12, y: 24, width: 320, height: 80 });
  assert.deepEqual(collectPlaneBoxes(document), [
    { selector: 'app-top-bar', index: 0, x: 12, y: 24, width: 320, height: 80 },
    { selector: 'app-project-section-frame', index: 0, x: 12, y: 24, width: 320, height: 80 },
    { selector: 'app-project-section-frame', index: 1, x: 12, y: 24, width: 320, height: 80 },
  ]);
});

test('content-coordinate evidence cancels ancestor scrolling only for immutable shell planes', () => {
  const { document } = new JSDOM('<main><div><app-project-header></app-project-header><app-project-section-frame></app-project-section-frame></div></main>').window;
  document.querySelector('main').scrollTop=400;
  document.querySelector('div').scrollTop=100;
  document.querySelector('div').scrollLeft=20;
  for(const element of document.querySelectorAll('app-project-header,app-project-section-frame'))element.getBoundingClientRect=()=>({x:40,y:-450,width:320,height:80});
  const boxes=collectPlaneBoxes(document,true);
  assert.deepEqual(boxes.find(e=>e.selector==='app-project-header'),{selector:'app-project-header',index:0,x:60,y:50,width:320,height:80});
  assert.equal(boxes.find(e=>e.selector==='app-project-section-frame').y,-450);
});

test('content-coordinate evidence keeps a sticky project column in viewport coordinates',()=>{
  const {document}=new JSDOM('<main><app-project-page-navigation style="position:sticky"></app-project-page-navigation></main>').window;
  document.querySelector('main').scrollTop=500;
  document.querySelector('app-project-page-navigation').getBoundingClientRect=()=>({x:240,y:48,width:224,height:852});
  assert.equal(collectPlaneBoxes(document,true)[0].y,48);
});

test('axe topology identity survives changed child text, styling classes and Angular scope hashes',()=>{
  assert.equal(typeof layout.axeNodeIdentity,'function','the collector exposes structural node identity');
  const {document}=new JSDOM('<main data-widget-type="today"><div class="task-row__metadata" _ngcontent-old>Old text</div></main>').window;
  const before=layout.axeNodeIdentity('main',document),metadata=layout.axeNodeIdentity('.task-row__metadata',document);
  const element=document.querySelector('div');element.textContent='New text';element.classList.add('object-row__meta');element.removeAttribute('_ngcontent-old');element.setAttribute('_ngcontent-new','');
  assert.equal(layout.axeNodeIdentity('main',document),before);
  assert.equal(layout.axeNodeIdentity('.task-row__metadata',document),metadata);
  element.insertAdjacentHTML('afterend','<div class="new-region">New node</div>');
  assert.notEqual(layout.axeNodeIdentity('.new-region',document),metadata);
});

test('partial evidence failures stay incomplete with artifact-specific reasons', async () => {
  const result = await collectEvidence({
    screenshot: async () => 'image.png',
    axe: async () => { throw new Error('scan interrupted'); },
    tree: async () => 'tree.yml',
  });
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.artifacts, { screenshot: 'image.png', tree: 'tree.yml' });
  assert.deepEqual(result.errors, { axe: 'scan interrupted' });
});

test('only complete successful evidence is marked captured', async () => {
  const result = await collectEvidence({ screenshot: async () => 'a', axe: async () => 'b', tree: async () => 'c' });
  assert.equal(result.status, 'captured');
  assert.deepEqual(result.errors, {});
});

/** Stubs every element's box: ids in `boxes` get theirs, everything else 80×32. */
function census(html, url, boxes = {}) {
  const { document } = new JSDOM(html, { url }).window;
  for (const element of document.querySelectorAll('*')) {
    const [width, height] = boxes[element.id] ?? [80, 32];
    element.getBoundingClientRect = () => ({ x: 0, y: 0, width, height });
  }
  return collectControls(document);
}

test('control census records kind, border, scope and the larger checkbox target', () => {
  const controls = census(`
    <app-sidebar><button class="button button--primary" type="submit">Create</button></app-sidebar>
    <label id="wrap"><input id="inside" type="checkbox"> Done</label>
    <input id="apart" type="radio"><label id="for" for="apart">Dark</label>
    <textarea></textarea><div role="button" tabindex="0">Open</div>
    <div class="markdown-renderer"><a href="#x">prose link</a></div>
    <app-dev-panel><select><option>a</option></select></app-dev-panel>`,
  'http://localhost/projects/p', { wrap: [120, 30], for: [60, 28], inside: [16, 16], apart: [16, 16] });
  const by = predicate => controls.find(predicate);
  const button = by(c => c.tag === 'button');
  assert.deepEqual([button.type, button.role, button.class, button.scope], ['submit', null, 'button button--primary', 'product']);
  assert.equal(typeof button.border, 'string');
  const inside = by(c => c.type === 'checkbox');
  assert.deepEqual([inside.width, inside.height, inside.target], [16, 16, { width: 120, height: 30 }]);
  assert.deepEqual(by(c => c.type === 'radio').target, { width: 60, height: 28 });
  assert.equal(by(c => c.tag === 'textarea').scope, 'product');
  assert.equal(by(c => c.role === 'button').tag, 'div');
  assert.equal(by(c => c.tag === 'a').scope, 'prose');
  assert.equal(by(c => c.tag === 'select').scope, 'prototype');
});

test('control census marks every control on a /prototype/ route as prototype scope', () => {
  assert.deepEqual(census('<button>Reset</button>', 'http://localhost/prototype/design').map(c => c.scope), ['prototype']);
});

test('control census includes the resize slider and its box', () => {
  const [slider] = census('<div role="slider" aria-label="Resize Notes"></div>', 'http://localhost/projects/p', {});
  assert.equal(slider?.role, 'slider');
  assert.deepEqual([slider.width, slider.height], [80, 32]);
});
