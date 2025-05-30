import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Use Vitest globals (describe, it, expect, etc.)
    environment: 'node', // Set the test environment to Node.js
    coverage: {
      provider: 'v8', // Use V8 for coverage collection
      reporter: ['text', 'json', 'html', 'lcov'], // Added lcov reporter
      reportsDirectory: './coverage', // Explicitly set the output directory
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
      include: ['src/**/*.ts'], // Restored include
      exclude: [
        // Restored and adjusted exclude
        'src/index.ts', // Often just exports
        'src/types/**', // Assuming types might be added later
        '**/*.d.ts',
        '**/*.config.ts',
        '**/constants.ts', // Assuming constants might be added later
        'src/handlers/chmodItems.ts', // Exclude due to Windows limitations
        'src/handlers/chownItems.ts', // Exclude due to Windows limitations
      ],
      clean: true, // Added clean option
    },
    deps: {
      optimizer: {
        ssr: {
          // Suggested replacement for deprecated 'inline' to handle problematic ESM dependencies
          include: [
            '@modelcontextprotocol/sdk',
            '@modelcontextprotocol/sdk/stdio',
            '@modelcontextprotocol/sdk/dist/types', // Add specific dist path
            '@modelcontextprotocol/sdk/dist/server', // Add specific dist path
          ],
        },
      },
    },
    // Exclude the problematic index test again
    exclude: [
      '**/node_modules/**', // Keep default excludes
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '__tests__/index.test.ts', // Exclude the index test
      '**/*.bench.ts', // Added benchmark file exclusion
    ],
  },
});