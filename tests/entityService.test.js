import test from 'node:test';
import assert from 'node:assert/strict';

import { createSupabaseEntityService } from '../src/modules/shared/services/createSupabaseEntityService.js';
import { setActiveWorkspaceId } from '../src/modules/shared/services/workspaceContext.js';

setActiveWorkspaceId('workspace-1');

const createMockClient = (response) => {
  const calls = [];

  return {
    calls,
    client: {
      from: (tableName) => {
        calls.push({ method: 'from', tableName });
        const builder = {
          select: () => {
            calls.push({ method: 'select' });
            return builder;
          },
          order: (column, options) => {
            calls.push({ method: 'order', column, options });
            return builder;
          },
          eq: (column, value) => {
            calls.push({ method: 'eq', column, value });
            return builder;
          },
          insert: (payload) => {
            calls.push({ method: 'insert', payload });
            return builder;
          },
          update: (payload) => {
            calls.push({ method: 'update', payload });
            return builder;
          },
          delete: () => {
            calls.push({ method: 'delete' });
            return builder;
          },
          maybeSingle: async () => response,
          single: async () => response,
          then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
        };
        return builder;
      },
    },
  };
};

test('entity service keeps list result shape and applies sort direction', async () => {
  const rows = [{ id: 'student-1' }];
  const mock = createMockClient({ data: rows, error: null });
  const service = createSupabaseEntityService(mock.client, 'student');

  assert.deepEqual(await service.list('-created_date'), rows);
  assert.deepEqual(mock.calls.find((call) => call.method === 'order'), {
    method: 'order',
    column: 'created_date',
    options: { ascending: false },
  });
  assert.ok(mock.calls.some((call) => (
    call.method === 'eq' && call.column === 'workspace_id' && call.value === 'workspace-1'
  )));
});

test('entity service propagates Supabase errors instead of returning empty data', async () => {
  const error = new Error('row level security policy violation');
  const mock = createMockClient({ data: null, error });
  const service = createSupabaseEntityService(mock.client, 'student');

  await assert.rejects(service.list(), (receivedError) => receivedError === error);
});

test('entity service rejects missing client configuration', () => {
  assert.throws(
    () => createSupabaseEntityService(null, 'student'),
    /Cliente Supabase e nome da tabela são obrigatórios/,
  );
});

test('entity service scopes writes to the active workspace and ignores caller workspace ids', async () => {
  const mock = createMockClient({ data: { id: 'student-1' }, error: null });
  const service = createSupabaseEntityService(mock.client, 'student');

  await service.create({ name: 'Aluno', workspace_id: 'workspace-other' });
  await service.update('student-1', { name: 'Aluno atualizado', workspace_id: 'workspace-other' });
  await service.delete('student-1');

  const insertCall = mock.calls.find((call) => call.method === 'insert');
  const updateCall = mock.calls.find((call) => call.method === 'update');
  assert.equal(insertCall.payload.workspace_id, 'workspace-1');
  assert.equal(updateCall.payload.workspace_id, undefined);
  assert.equal(
    mock.calls.filter((call) => call.method === 'eq' && call.column === 'workspace_id').length,
    2,
  );
});

test('entity service refuses workspace data access before a workspace is selected', async () => {
  setActiveWorkspaceId(null);
  const mock = createMockClient({ data: [], error: null });
  const service = createSupabaseEntityService(mock.client, 'student');

  await assert.rejects(service.list(), /Nenhum workspace ativo foi carregado/);
  setActiveWorkspaceId('workspace-1');
});
