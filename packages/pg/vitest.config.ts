import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        exclude: ['**/*.js'],
        name: 'jumbo',
        include: ['lib/pg-types/parsers/from-text/**/*.test.ts', 'lib/pg-types/parsers/from-binary/**/*.test.ts'],
        globals: true,
        setupFiles: ['./test/setupTests.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['lib/test-helpers.ts', '**/__tests__']
        },
        environment: 'node',
        watch: false,
        threads: true,
        maxThreads: 3,
        minThreads: 1,
        testTimeout: 1e9,
        silent: false,
        isolate: true,
        reporters: [
            /*'verbose'*/
        ]
    },
    resolve: {
        alias: {
            '@test-helpers': path.join(__dirname, 'lib/test-helpers.ts'),
            '@pg-types': path.join(__dirname, 'lib/pg-types'),
            '@constants': path.join(__dirname, 'lib/constants.ts'),
            '@helpers': path.join(__dirname, 'lib/helpers.ts')
            // "@pg-types/*": ["pg-types/*"],
            // "@test-helpers": ["test-helpers.ts"]
        }
    }
});
