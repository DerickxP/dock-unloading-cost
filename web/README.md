# Front (Angular 22)

Interface da doca para o sistema de custo de descarga. A documentação do
projeto inteiro está no [README da raiz](../README.md).

```bash
npm ci
npm start          # http://localhost:4200, com proxy de /api para a API em :3000
npm test           # Vitest, uma vez
npm run build      # dist/web/browser (servido pelo nginx no Docker)
```

Estrutura em `src/app/`: `core/` (contrato da API, cliente fetch,
configurações, formatação pt-BR), `shared/` (diálogo nativo, relato de
importação, botão de arquivo, paginação), `invoices/`, `stores/` e `products/`.
