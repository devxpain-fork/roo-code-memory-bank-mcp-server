#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import chalk from 'chalk';
import fs from 'fs/promises'; // Use promises for async operations
import path from 'path';
import { logger } from './logger.js';
import { BASE_PATH } from './utils/path.js';

// --- Constants ---
const MEMORY_BANK_DIR_NAME = "memory-bank";
const MEMORY_BANK_PATH = path.join(BASE_PATH, MEMORY_BANK_DIR_NAME);

const INITIAL_FILES: { [key: string]: string } = {
  "productContext.md": `# Product Context\n\nThis file provides a high-level overview...\n\n*`,
  "activeContext.md": `# Active Context\n\nThis file tracks the project's current status...\n\n*`,
  "progress.md": `# Progress\n\nThis file tracks the project's progress...\n\n*`,
  "decisionLog.md": `# Decision Log\n\nThis file records architectural and implementation decisions...\n\n*`,
  "systemPatterns.md": `# System Patterns *Optional*\n\nThis file documents recurring patterns...\n\n*`
};

// --- Helper Functions ---

function getCurrentTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

async function ensureMemoryBankDir(): Promise<void> {
  try {
    await fs.access(MEMORY_BANK_PATH);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(MEMORY_BANK_PATH, { recursive: true });
    console.error(chalk.green(`Created memory bank directory: ${MEMORY_BANK_PATH}`));
  }
}

// --- Tool Definitions ---

const INITIALIZE_MEMORY_BANK_TOOL: Tool = {
  name: "initialize_memory_bank",
  description: "Creates the memory-bank directory and standard .md files with initial templates.",
  inputSchema: {
    type: "object",
    properties: {
      project_brief_content: {
        type: "string",
        description: "(Optional) Content from projectBrief.md to pre-fill productContext.md"
      }
    },
    required: []
  }
  // Output: Confirmation message (handled in implementation)
};

const CHECK_MEMORY_BANK_STATUS_TOOL: Tool = {
  name: "check_memory_bank_status",
  description: "Checks if the memory-bank directory exists and lists the .md files within it.",
  inputSchema: { type: "object", properties: {} } // No input needed
  // Output: { exists: boolean, files: string[] } (handled in implementation)
};

const READ_MEMORY_BANK_TOOL: Tool = {
  name: "read_memory_bank",
  description: "Reads content from specified memory bank files, returning an object mapping file names to content (or `null` for not-found files); if `file_names` is omitted or empty, it lists all available `.md` files in the memory bank directory.",
  inputSchema: {
    type: "object",
    properties: {
      file_names: {
        type: "array",
        items: {
          type: "string"
        },
        description: "An optional array of memory bank file names (e.g., ['productContext.md', 'activeContext.md']). If omitted or empty, all available .md files will be listed."
      }
    },
    required: []
  }
};

const APPEND_MEMORY_BANK_ENTRY_TOOL: Tool = {
  name: "append_memory_bank_entry",
  description: "Appends a new, timestamped entry to a specified file, optionally under a specific markdown header.",
  inputSchema: {
    type: "object",
    properties: {
      file_name: {
        type: "string",
        description: "The name of the memory bank file to append to."
      },
      entry: {
        type: "string",
        description: "The content of the entry to append."
      },
      section_header: {
        type: "string",
        description: "(Optional) The exact markdown header (e.g., '## Decision') to append under."
      }
    },
    required: ["file_name", "entry"]
  }
  // Output: Confirmation message (handled in implementation)
};

const ALL_TOOLS = [
  READ_MEMORY_BANK_TOOL,
  APPEND_MEMORY_BANK_ENTRY_TOOL
];

// --- Server Logic ---

class RooMemoryBankServer {

  private async _ensureInitialized(): Promise<void> {
    try {
      await fs.access(MEMORY_BANK_PATH);
    } catch (error) {
      // Directory doesn't exist, create it and initial files
      await fs.mkdir(MEMORY_BANK_PATH, { recursive: true });
      console.error(chalk.green(`Created memory bank directory: ${MEMORY_BANK_PATH}`));

      for (const [fileName, template] of Object.entries(INITIAL_FILES)) {
        const filePath = path.join(MEMORY_BANK_PATH, fileName);
        try {
          await fs.access(filePath);
        } catch {
          let content = template;
          content = content.replace('YYYY-MM-DD HH:MM:SS', getCurrentTimestamp());
          await fs.writeFile(filePath, content);
          console.error(chalk.green(`Created file: ${fileName}`));
        }
      }
    }
  }

  async readMemoryBank(input: any): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    await this._ensureInitialized(); // Ensure memory bank is initialized

    const fileNames: string[] | undefined = input?.file_names;

    if (!fileNames || fileNames.length === 0) {
      // If no file_names are provided, list all .md files
      try {
        const files = await fs.readdir(MEMORY_BANK_PATH);
        const mdFiles = files.filter(f => f.endsWith('.md'));
        return { content: [{ type: "text", text: JSON.stringify({ files: mdFiles }, null, 2) }] };
      } catch (error: any) {
        console.error(chalk.red("Error listing memory bank files:"), error);
        return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: `Failed to list files: ${error.message}` }, null, 2) }], isError: true };
      }
    }

    // If file_names are provided, read the specific files
    if (!Array.isArray(fileNames) || !fileNames.every(name => typeof name === 'string')) {
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: "Invalid 'file_names' parameter. Must be an array of strings." }, null, 2) }], isError: true };
    }

    const results: { [key: string]: string | null } = {};
    for (const fileName of fileNames) {
      const filePath = path.join(MEMORY_BANK_PATH, fileName);
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        results[fileName] = fileContent;
      } catch (error: any) {
        console.warn(chalk.yellow(`Warning: File ${fileName} not found or could not be read. Returning null for this file.`));
        results[fileName] = null; // Handle file not found gracefully
      }
    }
    return { content: [{ type: "text", text: JSON.stringify({ files: results }, null, 2) }] };
  }

  async appendMemoryBankEntry(input: any): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    await this._ensureInitialized(); // Ensure memory bank is initialized

    const { file_name: fileName, entry, section_header: sectionHeader } = input;

    if (!fileName || typeof fileName !== 'string') {
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: "Missing or invalid 'file_name' parameter." }, null, 2) }], isError: true };
    }
    if (!entry || typeof entry !== 'string') {
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: "Missing or invalid 'entry' parameter." }, null, 2) }], isError: true };
    }

    const filePath = path.join(MEMORY_BANK_PATH, fileName);
    const timestamp = getCurrentTimestamp();
    const formattedEntry = `\n[${timestamp}] - ${entry}\n`;

    try {
      if (sectionHeader && typeof sectionHeader === 'string') {
        let fileContent = "";
        try {
          fileContent = await fs.readFile(filePath, 'utf-8');
        } catch (readError: any) {
          if (readError.code === 'ENOENT') { // File doesn't exist, create it
            console.warn(chalk.yellow(`File ${fileName} not found, creating.`));
            const initialTemplate = INITIAL_FILES[fileName] ? INITIAL_FILES[fileName].replace('YYYY-MM-DD HH:MM:SS', timestamp) : '';
            fileContent = initialTemplate;
          } else {
            throw readError;
          }
        }

        const headerIndex = fileContent.indexOf(sectionHeader);
        if (headerIndex !== -1) {
          const nextHeaderIndex = fileContent.indexOf('\n##', headerIndex + sectionHeader.length);
          const insertIndex = (nextHeaderIndex !== -1) ? nextHeaderIndex : fileContent.length;
          const updatedContent = fileContent.slice(0, insertIndex).trimEnd() + '\n' + formattedEntry.trimStart() + fileContent.slice(insertIndex);
          await fs.writeFile(filePath, updatedContent);
        } else {
          console.warn(chalk.yellow(`Header "${sectionHeader}" not found in ${fileName}. Appending header and entry to the end.`));
          await fs.appendFile(filePath, `\n${sectionHeader}\n${formattedEntry}`);
        }
      } else {
        await fs.appendFile(filePath, formattedEntry);
      }

      return { content: [{ type: "text", text: JSON.stringify({ status: "success", message: `Appended entry to ${fileName}` }, null, 2) }] };
    } catch (error: any) {
      console.error(chalk.red(`Error appending to file ${fileName}:`), error);
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: `Failed to append to file ${fileName}: ${error.message}` }, null, 2) }], isError: true };
    }
  }
}


// --- Server Setup ---
const server = new Server(
  {
    name: "roo-memory-bank-mcp-server",
    version: "0.1.0", // Initial version
  },
  {
    capabilities: {
      tools: {}, // Tools are dynamically listed
    },
  }
);

const memoryBankServer = new RooMemoryBankServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments;

  console.error(chalk.blue(`Received call for tool: ${toolName}`));
  // console.error(chalk.gray(`Arguments: ${JSON.stringify(args)}`)); // Optional: Log arguments

  switch (toolName) {
    case "read_memory_bank":
      return memoryBankServer.readMemoryBank(args);
    case "append_memory_bank_entry":
      return memoryBankServer.appendMemoryBankEntry(args);
    default:
      console.error(chalk.red(`Unknown tool requested: ${toolName}`));
      return {
        content: [{ type: "text", text: JSON.stringify({ status: "error", message: `Unknown tool: ${toolName}` }, null, 2) }],
        isError: true
      };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(chalk.green("Roo Memory Bank MCP Server running on stdio"));

  // Log environment and process details at startup
  logger.info('--- Server Initialization Details ---');
  logger.logProcessDetails();
  logger.logEnvironment();
  logger.info(`Current BASE_PATH: ${BASE_PATH}`);
  logger.info(`Memory Bank Path: ${MEMORY_BANK_PATH}`);
  logger.info('Roo Memory Bank MCP Server initialized.');
}

runServer().catch((error) => {
  console.error(chalk.red("Fatal error running server:"), error);
  process.exit(1);
});
