export const LEGAL_DOCUMENT_VERSION = '2026-09-18';

// Substitua os dados institucionais antes de publicar os documentos.
export const legalCompany = {
  name: 'MAEZTRO Gestão',
  legalName: '55.168.143 ROBERTO ROBSON SVICERO',
  document: '55.168.143/0001-01',
  email: 'privacidade@app-maeztro.gestfors.com.br',
};

export const privacySections = [
  {
    title: '1. Quem somos',
    paragraphs: [
      `${legalCompany.name} é uma plataforma de gestão para professores e profissionais de aulas. Para fins da LGPD, o responsável pelo tratamento dos dados deve ser identificado pelos dados institucionais acima.`,
    ],
  },
  {
    title: '2. Dados tratados',
    paragraphs: [
      'Podemos tratar dados de cadastro e autenticação do professor, dados da assinatura, informações de alunos cadastradas pelo professor, aulas, pagamentos, recibos, observações e registros técnicos necessários para segurança e funcionamento.',
      'O professor deve cadastrar somente os dados necessários para a finalidade da plataforma e evitar inserir informações sensíveis sem necessidade.',
    ],
  },
  {
    title: '3. Finalidades e bases legais',
    paragraphs: [
      'Os dados são utilizados para criar e proteger a conta, prestar as funcionalidades contratadas, organizar aulas e lembretes, processar pagamentos, oferecer suporte, prevenir fraudes e cumprir obrigações legais.',
      'As bases legais podem incluir execução do contrato, cumprimento de obrigação legal, exercício regular de direitos e legítimo interesse. Quando o consentimento for necessário, ele será solicitado de forma específica.',
    ],
  },
  {
    title: '4. Compartilhamento e armazenamento',
    paragraphs: [
      'Podemos utilizar fornecedores de infraestrutura, autenticação, armazenamento, suporte e pagamentos, como Supabase e Kiwify, sempre conforme suas respectivas responsabilidades e contratos. Os dados são armazenados pelo tempo necessário às finalidades informadas e às obrigações legais.',
    ],
  },
  {
    title: '5. Direitos do titular',
    paragraphs: [
      `O titular pode solicitar confirmação, acesso, correção, anonimização, eliminação quando aplicável, informação sobre compartilhamentos e demais direitos previstos na LGPD pelo canal ${legalCompany.email}.`,
      'O professor é responsável por informar os titulares dos dados de alunos que cadastrar e por obter autorizações necessárias quando aplicável, especialmente no caso de crianças e adolescentes.',
    ],
  },
  {
    title: '6. Segurança e contato',
    paragraphs: [
      'Adotamos medidas técnicas e administrativas compatíveis com os riscos do serviço. Nenhum sistema é completamente imune a incidentes; ocorrências relevantes serão tratadas conforme a legislação aplicável.',
      `Dúvidas ou solicitações sobre privacidade devem ser encaminhadas para ${legalCompany.email}.`,
    ],
  },
];

export const termsSections = [
  {
    title: '1. Aceitação',
    paragraphs: [
      'Estes Termos de Uso regulam o acesso ao MAEZTRO Gestão. Ao criar ou utilizar uma conta, o usuário declara que leu e aceitou estes termos e a Política de Privacidade.',
    ],
  },
  {
    title: '2. Serviço',
    paragraphs: [
      'A plataforma oferece recursos para organização de alunos, aulas, agenda, pagamentos, recibos e informações administrativas. Os recursos podem ser atualizados, aprimorados ou descontinuados por razões técnicas, legais ou comerciais.',
    ],
  },
  {
    title: '3. Responsabilidades do usuário',
    paragraphs: [
      'O usuário deve manter seus dados de acesso seguros, fornecer informações verdadeiras, utilizar o sistema de acordo com a lei e cadastrar dados de alunos somente quando tiver legitimidade e autorizações necessárias.',
      'O usuário não deve tentar acessar contas de terceiros, explorar vulnerabilidades, inserir conteúdo ilícito ou utilizar a plataforma para finalidade diferente da gestão de sua atividade profissional.',
    ],
  },
  {
    title: '4. Pagamentos e acesso',
    paragraphs: [
      'Planos, preços, cobrança, renovação, cancelamento e reembolso podem ser apresentados no checkout da Kiwify e também nas comunicações comerciais aplicáveis. O acesso pode ser suspenso quando a licença estiver expirada, cancelada ou em situação irregular.',
    ],
  },
  {
    title: '5. Dados e privacidade',
    paragraphs: [
      'O tratamento de dados pessoais é descrito na Política de Privacidade. O usuário continua responsável pela legalidade dos dados que inserir na plataforma e por atender solicitações dos titulares relacionados à sua atividade.',
    ],
  },
  {
    title: '6. Suporte e alterações',
    paragraphs: [
      `Para suporte ou dúvidas sobre estes termos, utilize ${legalCompany.email}. Podemos atualizar estes documentos; mudanças relevantes serão comunicadas e poderão exigir novo aceite.`,
    ],
  },
];
