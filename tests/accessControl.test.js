import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canAccessPage,
  canManageSettings,
  isStudioMember,
} from '../src/modules/shared/accessControl.js';

test('studio members cannot access automations but can access settings', () => {
  assert.equal(canAccessPage('Automations', 'teacher'), false);
  assert.equal(canAccessPage('Automations', 'finance'), false);
  assert.equal(canAccessPage('Settings', 'teacher'), true);
  assert.equal(canAccessPage('Settings', 'finance'), true);
});

test('only studio members and owners can manage settings', () => {
  assert.equal(isStudioMember('teacher', 'studio'), true);
  assert.equal(isStudioMember('finance', 'studio'), true);
  assert.equal(canManageSettings('teacher', 'studio'), true);
  assert.equal(canManageSettings('finance', 'studio'), true);
  assert.equal(canManageSettings('owner', 'individual'), true);
  assert.equal(canManageSettings('teacher', 'individual'), false);
});

test('platform administrators retain settings access without changing member permissions', () => {
  assert.equal(canAccessPage('Automations', null, true), true);
  assert.equal(canManageSettings(null, 'studio', true), true);
});
