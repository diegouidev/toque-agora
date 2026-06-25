Atue como um Engenheiro de Software Full-Stack Sênior e Especialista em DevOps/Home Labs. Quero criar um web app de player de música para rodar no meu servidor caseiro via Docker.

A dinâmica do app é: o usuário faz o upload de um arquivo `.rar` cheio de músicas (MP3). O sistema lê o conteúdo, lista as faixas na interface e, quando o usuário dá "Play", o back-end deve abrir o arquivo `.rar` em memória (via streaming/buffer), extrair apenas os bytes daquela faixa específica e transmiti-los (audio streaming) para o front-end, sem descompactar o arquivo inteiro no disco para economizar espaço e processamento.

Por favor, gere a estrutura base desse projeto utilizando a seguinte stack:
1. Back-end: Python com FastAPI (escolhido por ser leve e excelente com async/streaming) utilizando uma biblioteca compatível com extração parcial de arquivos RAR (como `rarfile` ou similar).
2. Front-end: Next.js (React) com Tailwind CSS, criando um player de música elegante (estilo Spotify/clean) com barra de progresso e lista de faixas.
3. Banco de Dados: PostgreSQL (apenas a estrutura de tabelas básica para salvar o caminho do .rar e o nome das músicas).
4. Infraestrutura: Um arquivo `docker-compose.yml` configurado para rodar o Front, o Back, o Postgres e mapear um volume local no meu servidor para armazenar os arquivos `.rar`.

Forneça:
- O código do `main.py` do FastAPI com a rota de upload e a rota de streaming de áudio sob demanda de dentro do .rar.
- O componente principal do Player em Next.js que consome essa rota de streaming.
- O arquivo `docker-compose.yml` pronto para produção no meu Home Lab.