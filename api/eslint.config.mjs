import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'jest.config.js', 'src/generated/', 'demo-output/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
