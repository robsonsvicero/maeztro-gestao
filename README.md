# Maestro Gestão

## Configurações do App Android (Capacitor)

Este projeto utiliza o Capacitor para empacotar a aplicação web como um aplicativo Android.

- **Localização do `build.gradle` (app/module):** O arquivo principal de configuração do módulo do aplicativo está localizado em `android/app/build.gradle`. As variáveis de versão estão definidas em `android/variables.gradle`.
- **Versão do SDK Alvo (Target SDK):** Atualmente, a versão alvo (`targetSdkVersion`) está configurada para **36** (conforme definido em `android/variables.gradle`).
- **Google Play Billing:** a integração nativa usa `@capgo/native-purchases` e está isolada em `src/services/billing/googlePlayBilling.js`. A compra só é reconhecida depois da validação pela Edge Function `google-play-verify`.

## ⚠️ Atenção: Arquivos Sensíveis

Antes de realizar commits ou enviar o projeto para repositórios públicos, **certifique-se de que arquivos sensíveis estão ignorados** no `.gitignore`. 
Os seguintes arquivos **nunca devem ser enviados**:
- `.env.local` (contém chaves reais e de desenvolvimento local)
- `.env`
- `google-services.json` (se existir dentro da pasta `android/app/`, pois contém credenciais do Firebase/Google)
- Chaves de assinatura como `.keystore` ou `.jks` (se geradas na pasta `android/`)

Use o arquivo `.env.example` apenas como referência de quais variáveis são necessárias.

---

## Deploy na Hostinger

O projeto é uma aplicação React/Vite estática. Execute o build e envie o conteúdo da pasta `dist/` para a pasta pública do domínio na Hostinger, normalmente `public_html/`. O arquivo `public/.htaccess` é copiado para `dist/` e mantém rotas como `/Schedule`, `/Settings` e `/login` funcionando ao atualizar a página diretamente.

Antes do build, configure as variáveis de ambiente no arquivo `.env.local` ou no ambiente de build da Hostinger:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-ou-publishable-do-supabase
```

Não envie o arquivo `.env.local` ao repositório e **nunca adicione `SUPABASE_SERVICE_ROLE_KEY` à Hostinger nem ao frontend**: ela concede privilégios administrativos ao banco e não deve ser exposta no navegador.

Depois de publicar o domínio, adicione-o no Supabase em **Authentication → URL Configuration**:

- **Site URL**: `https://app-maeztro.gestfors.com.br`;
- **Redirect URLs**: `https://app-maeztro.gestfors.com.br/Settings`, `https://app-maeztro.gestfors.com.br/login` e `https://app-maeztro.gestfors.com.br/workspace-invite`.

Para recuperação de senha, confirme que o provedor SMTP está configurado no Supabase.

## Workspaces e equipe

As migrations `supabase/workspaces.sql` e `supabase/automations.sql` ainda precisam ser revisadas e aplicadas no Supabase. Não publique o frontend nem as Edge Functions destas fases antes delas.

Ordem de implantação:

1. Confirme que `supabase/user_data_rls.sql` e o schema de entitlements (`supabase/google_play_billing_schema.sql`) já foram aplicados. Não reaplique migrations existentes sem revisar o estado atual do banco.
2. Faça backup e valide `supabase/workspaces.sql` primeiro em um ambiente de teste; ela cria o workspace padrão, atribui os registros existentes e substitui políticas RLS. Tabelas opcionais ausentes são ignoradas, não criadas; se precisar do recurso correspondente (por exemplo, Orçamento), aplique também o schema dessa tabela.
3. Configure `workspace_plan_limits` com os IDs reais de produtos e limites aprovados antes de enviar convites. O limite de membros considera usuários únicos em todos os workspaces do proprietário, incluindo convites pendentes. Produtos sem mapeamento ficam, intencionalmente, no limite seguro de um workspace e um membro (somente o proprietário).
4. Após `workspaces.sql`, aplique `supabase/automations.sql`. Ela cria o motor, as regras e o histórico; acrescenta professor responsável e presença às aulas e permite configurar a disponibilidade semanal.
5. Execute novamente `supabase/maintain_future_lessons.sql` para que a rotina agendada inclua o workspace, o professor e a presença pendente nas aulas criadas.
6. Revise e aplique `supabase/crm.sql`. Ela exige as colunas da tabela `public.student` usadas pela conversão e interrompe a execução se encontrar uma incompatibilidade.
7. Revise e aplique `supabase/intelligence.sql` para adicionar a data prevista de encerramento ao cadastro de alunos.
8. Publique as Edge Functions atualizadas (`activate-access`, `sync-recurrence` e `run-automations`) e, por último, o frontend.
9. Habilite `pg_net` (`create extension if not exists pg_net with schema extensions;`), configure `AUTOMATION_CRON_SECRET` nas secrets da Edge Function e armazene a URL do projeto e o mesmo token no Supabase Vault (`project_url` e `automation_cron_secret`). Crie um cron horário que invoque `run-automations` com `Authorization: Bearer <AUTOMATION_CRON_SECRET>` e `timeout_milliseconds := 30000`; o worker rejeita chamadas sem esse token. Não use uma chave de usuário no agendamento.

As automações desta fase geram somente avisos internos no painel; não enviam e-mail, WhatsApp ou mensagens aos alunos. O horário semanal padrão é segunda-feira às 8h de São Paulo. Regras sem dados necessários (por exemplo, ocupação sem horários cadastrados) ficam bloqueadas com o motivo registrado no histórico.

O CRM é privado ao proprietário. A migration `supabase/crm.sql` adiciona o funil de interessados, contatos, aulas experimentais, conversão com conferência de telefone e lembretes internos de follow-up. Professores designados veem na agenda apenas o horário e o rótulo “Aula experimental”.

Professores podem administrar alunos e aulas; o papel Financeiro tem leitura de finanças. A assinatura do proprietário autoriza membros ativos do workspace. Convites expiram em sete dias e só são aceitos por uma conta com o mesmo endereço de e-mail.
