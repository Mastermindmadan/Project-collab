export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    '\\.(css|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', {
      // CommonJS output targeted at the jsdom environment.
      tsconfig: {
        module: 'commonjs',
        jsx: 'react-jsx',
        target: 'es2023',
        lib: ['es2023', 'dom'],
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        types: ['jest', 'node', 'vite/client'],
        moduleResolution: 'node',
        verbatimModuleSyntax: false,
        skipLibCheck: true,
      },
      // Transpile-only. Full type-checking is performed by `tsc -b` during
      // `npm run build`; failing the Jest run on diagnostics breaks modules
      // that reference Vite-specific `import.meta.env` via `apiEnv.ts`.
      diagnostics: false,
    }],
  },
};
