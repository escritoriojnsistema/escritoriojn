# Revisão independente — Conta e correções

Revisão somente leitura, sem contas ou dados hospedados. Dois P2 encontrados e corrigidos, com rechecagem independente sem P1/P2 remanescente nesses pontos:

- Intenção pendente de e-mail não alterava a versão em contas legadas sem CPF completo/ficha ligada. Agora email_intent integra a versão, impedindo que outra aba substitua o destino com a versão antiga. Regressão SQL: alteração somente de e-mail muda a versão; segunda gravação obsoleta recebe conflito.
- Confirmação de e-mail falhava se a ficha já tivesse o novo endereço como contato secundário. Agora a sincronização trava as fichas ligadas, conserva o contato de destino, remove somente o contato antigo correspondente e atualiza versões. Regressão SQL: confirmação com destino secundário preexistente conserva um único contato de e-mail.

Revisão também cobriu autorização das propostas, RPCs/ACL, responsabilidade, Auth e isolamento. O parecer é estático; execução e publicação estão registradas na validação/fecho do ajuste.
