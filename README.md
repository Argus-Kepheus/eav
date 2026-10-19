# EAV — Estado Atual Verificável

Website: https://eav.arguskepheus.com.br/

## Publicação manual

Abra **Actions → Publicar EAV → Run workflow**, mantenha **main** e confirme.
Cada execução nova busca a versão atual do repositório privado datalog, valida o projeto, gera o site e publica no GitHub Pages.
Não é necessário usar Re-run de uma execução anterior.

O arquivo público `deployment.json` identifica o commit do fonte usado e a execução da publicação.
O fonte privado e as credenciais não fazem parte do site publicado.
