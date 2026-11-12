import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');

// Exercise the installed native KeyboardAvoidingView implementation without
// an Android runtime. Only its native host views/services are replaced.
function nativeBoundary(platform: 'android' | 'ios') {
  const nativeFile = require.resolve('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView');
  const nativeCode = transformSync(readFileSync(nativeFile, 'utf8'), {
    filename: nativeFile, babelrc: false, configFile: false,
    plugins: [['@babel/plugin-transform-flow-strip-types', { allowDeclareFields: true }], '@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
  }).code;
  const nativeModule = { exports: {} as any };
  new Function('require', 'module', 'exports', nativeCode)((name: string) => {
    if (name === 'react') return React;
    if (name.endsWith('/Platform')) return { OS: platform };
    if (name.endsWith('/StyleSheet')) return { compose: (first: object, second: object) => ({ ...first, ...second }) };
    if (name.endsWith('/LayoutAnimation')) return { configureNext() {}, Types: {} };
    if (name.endsWith('/AccessibilityInfo')) return { prefersCrossFadeTransitions: async () => false };
    if (name === './Keyboard') return { isVisible: () => false };
    if (name.endsWith('/View')) return 'NativeView';
    throw new Error(`Unexpected native dependency: ${name}`);
  }, nativeModule, nativeModule.exports);

  const code = ts.transpileModule(readFileSync(new URL('../src/ui/KeyboardLayout.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const boundaryModule = { exports: {} as any };
  new Function('require', 'module', 'exports', code)((name: string) => {
    if (name === 'react') return React;
    if (name === 'react-native') return { Platform: { OS: platform }, KeyboardAvoidingView: nativeModule.exports.default };
    if (name.endsWith('/useKeyboardLayout')) return { useKeyboardLayout: () => ({ visible: true, bottomInset: 0 }) };
    throw new Error(`Unexpected boundary dependency: ${name}`);
  }, boundaryModule, boundaryModule.exports);
  const element = boundaryModule.exports.KeyboardLayout({ children: null });
  const instance = new element.type(element.props);
  instance.setState = (state: object) => { instance.state = { ...instance.state, ...state }; };
  return instance;
}

for (const platform of ['android', 'ios'] as const) {
  test(`${platform} keyboard overlay reserves space and releases it on dismissal`, async () => {
    const boundary = nativeBoundary(platform);
    boundary._frame = { x: 0, y: 0, width: 390, height: 844 };
    boundary._keyboardEvent = { duration: 0, endCoordinates: { screenY: 524, height: 320 } };
    await boundary._updateBottomIfNecessary();
    assert.equal(boundary.render().props.style.paddingBottom, 320);
    // If the OS already resized the window, do not subtract the keyboard twice.
    boundary._frame.height = 524;
    await boundary._updateBottomIfNecessary();
    assert.equal(boundary.render().props.style.paddingBottom, 0);
    boundary._keyboardEvent = null;
    boundary._frame.height = 844;
    await boundary._updateBottomIfNecessary();
    assert.equal(boundary.render().props.style.paddingBottom, 0);
  });
}
