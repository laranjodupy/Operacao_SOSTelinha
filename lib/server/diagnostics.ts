import "server-only";
// Only fixed classifications may be logged: never raw messages, SQL, URLs or parameters.
const hints: Record<string,string> = {
  SUPABASE_CONFIG: 'Configure SUPABASE_URL e SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY) no servidor.',
  SUPABASE_AUTH: 'A chave de servidor do Supabase foi recusada. Confira a Secret key, o projeto e as permissões da RPC.',
  SUPABASE_MIGRATION: 'Execute 001_initial.sql e 002_data_api.sql no SQL Editor e confira se a Data API está habilitada.',
  SUPABASE_NETWORK: 'Não foi possível acessar a Data API HTTPS. Confira SUPABASE_URL e disponibilidade do projeto.',
  SUPABASE_API: 'Falha na Data API. Confira migrações, permissões da RPC e disponibilidade do Supabase.',

  DATABASE_UNCONFIGURED: 'Cadastre DATABASE_URL no ambiente do deploy e faça novo deploy.',
  '28P01': 'Autenticação PostgreSQL recusada. Confira a senha do banco e o usuário da URI do pooler.',
  '28000': 'Autenticação PostgreSQL recusada. Confira o usuário e a configuração da conexão.',
  '42P01': 'Tabela ausente. Execute supabase/migrations/001_initial.sql no projeto apontado por DATABASE_URL.',
  '3F000': 'Schema ausente. Execute a migração SQL no banco de destino.',
  '42501': 'O usuário do banco não tem permissão para acessar o schema privado.',
  '3D000': 'Banco inexistente. Copie novamente a URI do painel Connect do Supabase.',
  '22003': 'Um valor ultrapassou o tipo de coluna. Confira se a migração usada é a desta versão.',
  '42702': 'SQL ambíguo. Confirme que o deploy usa a versão atual do adaptador PostgreSQL.',
  'XX000': 'Falha interna do banco ou pooler. Confira usuário, host, projeto e disponibilidade no Supabase.',
  ENOTFOUND: 'Host não encontrado. Confira o host da conexão copiada em Connect.',
  EAI_AGAIN: 'Falha temporária de DNS ao resolver o banco.',
  ECONNREFUSED: 'Conexão recusada. Confira host, porta e disponibilidade do banco.',
  ECONNRESET: 'Conexão encerrada pelo servidor. Confira disponibilidade e rede do banco.',
  ETIMEDOUT: 'A conexão com o banco excedeu o tempo de espera.',
  ENETUNREACH: 'Rede inacessível. Confira a URI do Transaction pooler, compatível com IPv4.',
  SELF_SIGNED_CERT_IN_CHAIN: 'Falha na confiança TLS. Configure DATABASE_SSL_CA com o certificado CA do Supabase.',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'Certificado TLS não confiável. Configure a CA correta do projeto.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Não foi possível validar a cadeia TLS. Configure DATABASE_SSL_CA.',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'CA do emissor ausente. Configure DATABASE_SSL_CA.',
  CERT_HAS_EXPIRED: 'Certificado TLS expirado. Confira certificado e CA do servidor.',
  ERR_TLS_CERT_ALTNAME_INVALID: 'O host não corresponde ao certificado TLS. Confira o endereço do banco.',
  UNKNOWN: 'Erro sem classificação. Use npm run db:check com a configuração do ambiente afetado.',
};
export function safeDiagnostic(error: unknown): {code:string; hint:string} {
  const pending: unknown[] = [error];
  for (let i=0; i<pending.length && i<10; i++) {
    const item = pending[i];
    if (!item || typeof item !== 'object') continue;
    const e = item as {code?:unknown; cause?:unknown; errors?:unknown; message?:unknown};
    if (typeof e.code === 'string' && Object.hasOwn(hints, e.code))
      return {code:e.code, hint:hints[e.code]};
    if (e.message === 'Configure DATABASE_URL do Supabase antes de publicar.')
      return {code:'DATABASE_UNCONFIGURED',hint:hints.DATABASE_UNCONFIGURED};
    if(e.cause) pending.push(e.cause);
    if(Array.isArray(e.errors)) pending.push(...e.errors.slice(0,5));
  }
  return {code:'UNKNOWN',hint:hints.UNKNOWN};
}
