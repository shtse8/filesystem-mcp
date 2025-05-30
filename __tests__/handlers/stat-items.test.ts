import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StatResult } from '../../src/handlers/stat-items';
// import * as fsPromises from 'fs/promises'; // Removed unused import
import path from 'node:path';
// Import the definition object - will be mocked later
// import { statItemsToolDefinition } from '../../src/handlers/statItems.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'; // Match source import path
import { createTemporaryFilesystem, cleanupTemporaryFilesystem } from '../test-utils.js'; // Assuming a test utility exists, add .js extension

// Mock pathUtils BEFORE importing the handler that uses it
// Mock pathUtils using vi.mock (hoisted)

const mockResolvePath = vi.fn<(path: string) => string>();
vi.mock('../../src/utils/path-utils.js', () => ({
  PROJECT_ROOT: 'mocked/project/root', // Keep simple for now
  resolvePath: mockResolvePath,
}));

// Now import the handler AFTER the mock is set up
const { statItemsToolDefinition } = await import('../../src/handlers/stat-items.js');

// Define the structure for the temporary filesystem
const testStructure = {
  'file1.txt': 'content1',
  dir1: {
    'file2.js': 'content2',
  },
  emptyDir: {},
};

let tempRootDir: string;
// let originalCwd: string; // No longer needed

describe('handleStatItems Integration Tests', () => {
  beforeEach(async () => {
    // originalCwd = process.cwd(); // No longer needed
    tempRootDir = await createTemporaryFilesystem(testStructure);

    // Configure the mock resolvePath for this test run
    // Add explicit return type to the implementation function for clarity, although the fix is mainly in jest.fn()
    mockResolvePath.mockImplementation((relativePath: string): string => {
      const absolutePath = path.resolve(tempRootDir, relativePath);
      // Basic security check simulation (can be enhanced if needed)
      if (!absolutePath.startsWith(tempRootDir)) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Mocked Path traversal detected for ${relativePath}`,
        );
      }
      // Simulate absolute path rejection
      if (path.isAbsolute(relativePath)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Mocked Absolute paths are not allowed for ${relativePath}`,
        );
      }
      return absolutePath;
    });
  });

  afterEach(async () => {
    // Change CWD back - No longer needed
    // process.chdir(originalCwd);
    await cleanupTemporaryFilesystem(tempRootDir);
    vi.clearAllMocks(); // Clear all mocks, including resolvePath
  });

  // Helper function to assert stat results
  interface ExpectedStatProps {
    status: 'success' | 'error';
    isFile?: boolean;
    isDirectory?: boolean;
    size?: number;
    error?: string | RegExp;
  }

  // --- REFACTORED HELPER FUNCTIONS START ---
  function assertSuccessStat(
    resultItem: StatResult,
    expectedPath: string,
    expectedProps: ExpectedStatProps,
  ): void {
    expect(
      resultItem.stats,
      `Expected stats object for successful path '${expectedPath}'`,
    ).toBeDefined();
    if (expectedProps.isFile !== undefined) {
      expect(
        resultItem.stats?.isFile,
        `Expected isFile=${String(expectedProps.isFile)} for path '${expectedPath}'`,
      ).toBe(expectedProps.isFile);
    }
    if (expectedProps.isDirectory !== undefined) {
      expect(
        resultItem.stats?.isDirectory,
        `Expected isDirectory=${String(expectedProps.isDirectory)} for path '${expectedPath}'`,
      ).toBe(expectedProps.isDirectory);
    }
    if (expectedProps.size !== undefined) {
      expect(
        resultItem.stats?.size,
        `Expected size=${expectedProps.size} for path '${expectedPath}'`,
      ).toBe(expectedProps.size);
    }
    expect(resultItem.error, `Expected no error for path '${expectedPath}'`).toBeUndefined();
  }

  function assertErrorStat(
    resultItem: StatResult,
    expectedPath: string,
    expectedProps: ExpectedStatProps,
  ): void {
    expect(
      resultItem.stats,
      `Expected no stats object for error path '${expectedPath}'`,
    ).toBeUndefined();
    expect(resultItem.error, `Expected error message for path '${expectedPath}'`).toBeDefined();
    if (expectedProps.error) {
      if (expectedProps.error instanceof RegExp) {
        expect(
          resultItem.error,
          `Error message for path '${expectedPath}' did not match regex`,
        ).toMatch(expectedProps.error);
      } else {
        expect(
          resultItem.error,
          `Error message for path '${expectedPath}' did not match string`,
        ).toBe(expectedProps.error);
      }
    }
  }

  function assertStatResult(
    results: StatResult[],
    expectedPath: string,
    expectedProps: ExpectedStatProps,
  ): void {
    const resultItem = results.find((r: StatResult) => r.path === expectedPath);
    expect(resultItem, `Result for path '${expectedPath}' not found`).toBeDefined();
    if (!resultItem) return; // Guard for type safety

    expect(
      resultItem.status,
      `Expected status '${expectedProps.status}' for path '${expectedPath}'`,
    ).toBe(expectedProps.status);

    if (expectedProps.status === 'success') {
      assertSuccessStat(resultItem, expectedPath, expectedProps);
    } else {
      assertErrorStat(resultItem, expectedPath, expectedProps);
    }
  }
  // --- REFACTORED HELPER FUNCTIONS END ---

  it('should return stats for existing files and directories', async () => {
    const request = {
      paths: ['file1.txt', 'dir1', 'dir1/file2.js', 'emptyDir'],
    };
    // Use the handler from the imported definition
    const rawResult = await statItemsToolDefinition.handler(request);
    // Assuming the handler returns { content: [{ type: 'text', text: JSON.stringify(results) }] }
    const result = JSON.parse(rawResult.content[0].text);

    expect(result).toHaveLength(4);

    // *** Uses refactored helper ***
    assertStatResult(result, 'file1.txt', {
      status: 'success',
      isFile: true,
      isDirectory: false,
      size: Buffer.byteLength('content1'),
    });

    assertStatResult(result, 'dir1', {
      status: 'success',
      isFile: false,
      isDirectory: true,
    });

    assertStatResult(result, 'dir1/file2.js', {
      status: 'success',
      isFile: true,
      isDirectory: false,
      size: Buffer.byteLength('content2'),
    });

    assertStatResult(result, 'emptyDir', {
      status: 'success',
      isFile: false,
      isDirectory: true,
    });
  });

  it('should return errors for non-existent paths', async () => {
    const request = {
      paths: ['file1.txt', 'nonexistent.file', 'dir1/nonexistent.js'],
    };
    const rawResult = await statItemsToolDefinition.handler(request);
    const result = JSON.parse(rawResult.content[0].text);

    expect(result).toHaveLength(3);

    // Use helper for success case
    assertStatResult(result, 'file1.txt', { status: 'success' });

    // Use helper for error cases
    assertStatResult(result, 'nonexistent.file', {
      status: 'error',
      error: 'Path not found',
    });

    assertStatResult(result, 'dir1/nonexistent.js', {
      status: 'error',
      error: 'Path not found',
    });
  });

  it('should return error for absolute paths (caught by mock resolvePath)', async () => {
    // Use a path that path.isAbsolute will detect, even if it's within the temp dir conceptually
    const absolutePath = path.resolve(tempRootDir, 'file1.txt');
    const request = {
      paths: [absolutePath], // Pass the absolute path directly
    };

    // Our mock resolvePath will throw an McpError when it sees an absolute path
    const rawResult = await statItemsToolDefinition.handler(request);
    const result = JSON.parse(rawResult.content[0].text);
    expect(result).toHaveLength(1);

    // Use helper for error case
    assertStatResult(result, absolutePath.replaceAll('\\', '/'), {
      // Normalize path for comparison if needed
      status: 'error',
      error: /Mocked Absolute paths are not allowed/,
    });
  });

  it('should return error for path traversal (caught by mock resolvePath)', async () => {
    const request = {
      paths: ['../outside.txt'],
    };

    // The handler now catches McpErrors from resolvePath and returns them in the result array
    const rawResult = await statItemsToolDefinition.handler(request);
    const result = JSON.parse(rawResult.content[0].text);
    expect(result).toHaveLength(1);

    // Use helper for error case
    assertStatResult(result, '../outside.txt', {
      status: 'error',
      error: /Path traversal detected/,
    });
  });

  it('should handle an empty paths array gracefully', async () => {
    // The Zod schema has .min(1), so this should throw an InvalidParams error
    const request = {
      paths: [],
    };
    await expect(statItemsToolDefinition.handler(request)).rejects.toThrow(McpError);
    await expect(statItemsToolDefinition.handler(request)).rejects.toThrow(
      /Paths array cannot be empty/,
    );
  });

  it('should handle generic errors from resolvePath', async () => {
    const errorPath = 'genericErrorPath.txt';
    const genericErrorMessage = 'Simulated generic error from resolvePath';

    // Temporarily override the mockResolvePath implementation for this specific test case
    // to throw a generic Error instead of McpError for the target path.
    mockResolvePath.mockImplementationOnce((relativePath: string): string => {
      if (relativePath === errorPath) {
        throw new Error(genericErrorMessage); // Throw a generic error
      }
      // Fallback to the standard mock implementation for any other paths (if needed)
      // This part might not be strictly necessary if only errorPath is passed.
      const absolutePath = path.resolve(tempRootDir, relativePath);
      if (!absolutePath.startsWith(tempRootDir)) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Mocked Path traversal detected for ${relativePath}`,
        );
      }
      if (path.isAbsolute(relativePath)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Mocked Absolute paths are not allowed for ${relativePath}`,
        );
      }
      return absolutePath;
    });

    const request = {
      paths: [errorPath],
    };

    // The handler should catch the generic error from resolvePath
    // and enter the final catch block (lines 55-58 in statItems.ts)
    const rawResult = await statItemsToolDefinition.handler(request);
    const result = JSON.parse(rawResult.content[0].text);

    expect(result).toHaveLength(1);

    // Use helper for error case
    assertStatResult(result, errorPath, {
      status: 'error',
      error: new RegExp(`Failed to get stats: ${genericErrorMessage}`), // Use regex to avoid exact match issues
    });

    // No need to restore mockResolvePath as mockImplementationOnce only applies once.
    // The beforeEach block will set the standard implementation for the next test.
  });
});

// Placeholder for testUtils - needs actual implementation
// You might need to create a __tests__/testUtils.ts file
/*
async function createTemporaryFilesystem(structure: any, currentPath = process.cwd()): Promise<string> {
  const tempDir = await fsPromises.mkdtemp(path.join(currentPath, 'jest-statitems-test-'));
  await createStructureRecursively(structure, tempDir);
  return tempDir;
}

async function createStructureRecursively(structure: any, currentPath: string): Promise<void> {
  for (const name in structure) {
    const itemPath = path.join(currentPath, name);
    const content = structure[name];
    if (typeof content === 'string') {
      await fsPromises.writeFile(itemPath, content);
    } else if (typeof content === 'object' && content !== null) {
      await fsPromises.mkdir(itemPath);
      await createStructureRecursively(content, itemPath);
    }
  }
}


async function cleanupTemporaryFilesystem(dirPath: string): Promise<void> {
  await fsPromises.rm(dirPath, { recursive: true, force: true });
}
*/
