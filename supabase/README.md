# Migrações do Supabase

## Fase 1 — dados por professor

Execute `user_data_rls.sql` uma única vez no SQL Editor do Supabase antes de
comercializar o aplicativo.

O script adiciona `user_id` às tabelas do aplicativo, atribui os registros já
existentes ao professor indicado e aplica RLS para que cada usuário autenticado
possa ler e alterar somente os próprios dados.

Antes de executar:

1. Crie ou confirme a conta do professor em **Authentication > Users**.
2. Abra `user_data_rls.sql` e substitua
   `SUBSTITUA-PELO-EMAIL-DO-PROFESSOR` pelo e-mail dessa conta.
3. Cole o script completo no **SQL Editor** e execute.
4. Saia e entre novamente no aplicativo; cadastre um aluno de teste e confirme
   que ele aparece apenas nesta conta.

Não execute `transaction_rls.sql`: ele foi mantido apenas como aviso de que a
política anterior era ampla demais para um produto comercial.

Se você executou uma versão anterior de `user_data_rls.sql`, execute também
`security_hardening.sql` para impedir que um usuário altere o próprio papel.

## Rotina de aulas futuras

Depois de executar `user_data_rls.sql`, execute novamente
`maintain_future_lessons.sql`. A versão atual preserva o `user_id` do professor
ao criar aulas mensais pela rotina do banco.

## Modalidade de cobrança dos alunos

Execute `student_payment_modes.sql` para adicionar a escolha entre mensalidade
e cobrança por aula/semanal. Alunos existentes continuam usando mensalidade;
novos alunos semanais usam o valor por aula e têm os pagamentos registrados por
semana, com transação e recibo.

## Fase 2 — Kiwify

Execute `google_play_billing_schema.sql` e, se ele já tiver sido executado,
`kiwify_entitlements_migration.sql` antes de publicar a Edge Function. As
instruções de secrets, deploy e teste ficam em `functions/kiwify-webhook/README.md`.

## Fase 3 — ativação do comprador

Publique também a Edge Function `activate-access`:

```bash
supabase functions deploy activate-access --no-verify-jwt
```

Na compra Kiwify aprovada, o webhook cria e convida a conta com o e-mail do
comprador. O professor define a senha pelo link recebido e acessa tanto o site
quanto o app futuro com essa mesma conta.

## Fase 4 — CRM

Depois de aplicar `workspaces.sql`, `automations.sql` e
`maintain_future_lessons.sql`, revise e execute `crm.sql` no SQL Editor do
Supabase. A migration valida os campos de `public.student` usados na conversão
e interrompe a execução se a estrutura não for compatível.

## Tipo de conta: Individual e Estúdio

Depois de `workspaces.sql`, revise e execute `account_types.sql`. A migration
define o tipo comercial no workspace, aplica os limites no banco e preserva os
dados ao trocar uma conta de Individual para Estúdio. Contas Individual ficam
limitadas ao proprietário; Estúdio pode ter até 10 membros no total, incluindo
o proprietário. Workspaces existentes recebem Individual por padrão e podem
ser reclassificados pelo administrador. O tipo enviado no cadastro de teste é
aplicado ao workspace padrão.

Publique as Edge Functions atualizadas para habilitar o seletor de tipo nos
convites administrativos e a edição segura das contas:

```bash
supabase functions deploy admin-licenses --no-verify-jwt
supabase functions deploy admin-create-lifetime-license --no-verify-jwt
```

O administrador da plataforma pode alterar o tipo de qualquer conta pela tela
de Licenças. A alteração atualiza os workspaces pertencentes ao usuário, sem
mover ou apagar dados. Os valores comerciais e o produto de cobrança ainda
precisam ser configurados no provedor de pagamentos antes de cobrar os planos.

## Configurações de membros do Estúdio

Execute `studio_member_settings.sql` depois de `workspaces.sql` e
`account_types.sql`. A função permite a professores e membros financeiros ativos
alterar apenas nome profissional, telefone, logo/foto, duração padrão e horários
disponíveis. O acesso às Automações continua exclusivo do proprietário.

O CRM é privado ao proprietário. Professores designados veem na agenda somente
o horário e o rótulo “Aula experimental”. Após aplicar a migration, publique a
Edge Function `run-automations` atualizada para habilitar lembretes de retorno.
Os avisos são internos e aparecem na central de Automações; nenhum contato
externo é enviado.

Valide com uma conta proprietária e outra de professor: o proprietário deve
conseguir cadastrar um interessado, registrar contato, agendar uma experimental
e converter o cadastro; o professor não deve conseguir ler o lead nem o
histórico, mas deve ver somente horário e rótulo da experimental designada na
agenda. Confirme também os totais do funil após marcar a aula como realizada e
o interessado como matriculado.

## Fase 5 — Inteligência de Gestão

Depois de `crm.sql`, revise e execute `intelligence.sql`. Ela adiciona
`student.expected_end_date`, usada para identificar alunos com encerramento
previsto nos próximos 15 dias. O campo pode ser preenchido ou atualizado no
cadastro do aluno.

O Dashboard mantém os valores financeiros registrados e adiciona indicadores
determinísticos para cobranças, recebimentos previstos, agenda, retornos do CRM
e encerramentos. A previsão mensal usa o próximo vencimento cadastrado; na
cobrança semanal, considera uma cobrança por semana com aula marcada, conforme
o fluxo atual. A disponibilidade individual é apenas uma estimativa, calculada
com a grade geral do estúdio menos os compromissos atribuídos a cada professor;
ela não substitui uma grade de disponibilidade por professor.

## Administração de licenças

Publique `admin-licenses` para habilitar a tela `/AdminLicenses`:

```bash
supabase functions deploy admin-licenses --no-verify-jwt
```

Ela exige `profiles.role = 'admin'` no servidor e permite consultar licenças e
eventos, além de liberar ou revogar manualmente uma licença.
