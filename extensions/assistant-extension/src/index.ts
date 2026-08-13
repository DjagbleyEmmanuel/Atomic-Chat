import { Assistant, AssistantExtension, fs, joinPath } from '@janhq/core'

/**
 * Atomic Chat default assistant instructions.
 *
 * Deliberately does NOT ask the model to narrate its thought process: models
 * that follow that instruction dump their reasoning as plain text, which then
 * renders as a normal message (outside the reasoning UI) and can crowd out the
 * actual answer. Reasoning is requested internally via the backend thinking
 * flag instead, and the model is told to output only its final answer.
 */
const ATOMIC_CHAT_INSTRUCTIONS = `You are Atomic Chat, a helpful AI assistant who assists users with their requests. Atomic Chat is trained by Atomic Chat (https://atomic.chat).

You must output your response in the exact language used in the latest user message. Do not provide translations or switch languages unless explicitly instructed to do so. If the input is mostly English, respond in English.

Reason through requests before responding, but keep your reasoning internal — never narrate or show your thought process. Output only your final answer.

You have tools to search for and access real-time, up-to-date data. Use them whenever the answer requires current or external information. Search before stating that you can't or don't know.

Current date: {{current_date}}`

/**
 * JanAssistantExtension is an AssistantExtension implementation that provides
 * functionality for managing assistants.
 */
export default class JanAssistantExtension extends AssistantExtension {
  private readonly CURRENT_MIGRATION_VERSION = 3
  private readonly MIGRATION_FILE = 'file://assistants/.migration_version'

  /**
   * Called when the extension is loaded.
   */
  async onLoad() {
    if (!(await fs.existsSync('file://assistants'))) {
      await fs.mkdir('file://assistants')
    }

    // Run migrations if needed
    await this.runMigrations()

    const assistants = await this.getAssistants()
    if (assistants.length === 0) {
      // Add default parameters when creating the assistant
      const assistantWithParams = {
        ...this.defaultAssistant,
        parameters: {
          temperature: 0.7,
          top_k: 20,
          top_p: 0.8,
          repeat_penalty: 1.12,
        },
      }
      await this.createAssistant(assistantWithParams as Assistant)
    }
  }

  /**
   * Gets the current migration version from storage
   */
  private async getCurrentMigrationVersion(): Promise<number> {
    try {
      if (await fs.existsSync(this.MIGRATION_FILE)) {
        const versionStr = await fs.readFileSync(this.MIGRATION_FILE)
        const version = parseInt(versionStr.trim(), 10)
        return isNaN(version) ? 0 : version
      }
    } catch (error) {
      console.error('Failed to read migration version:', error)
    }
    return 0
  }

  /**
   * Saves the migration version to storage
   */
  private async saveMigrationVersion(version: number): Promise<void> {
    try {
      await fs.writeFileSync(this.MIGRATION_FILE, version.toString())
    } catch (error) {
      console.error('Failed to save migration version:', error)
    }
  }

  /**
   * Runs all pending migrations
   */
  private async runMigrations(): Promise<void> {
    const currentVersion = await this.getCurrentMigrationVersion()

    if (currentVersion < 1) {
      console.log('Running migration v1: Update assistant instructions')
      await this.migrateAssistantInstructions()
      await this.saveMigrationVersion(1)
    }

    if (currentVersion < 2) {
      console.log('Running migration v2: Update to Atomic Chat instructions')
      await this.migrateToAtomicChatInstructions()
      await this.saveMigrationVersion(2)
    }

    if (currentVersion < 3) {
      console.log('Running migration v3: Stop narrating the thought process')
      await this.migrateToDirectAnswerInstructions()
      await this.saveMigrationVersion(3)
    }

    console.log(
      `Migrations complete. Current version: ${this.CURRENT_MIGRATION_VERSION}`
    )
  }

  /**
   * Migration v1: Update assistant instructions from old format to new format
   */
  private async migrateAssistantInstructions(): Promise<void> {
    const OLD_INSTRUCTION = 'You are a helpful AI assistant.'
    const NEW_INSTRUCTION = 'You are Atomic Chat, a helpful AI assistant.'

    if (!(await fs.existsSync('file://assistants'))) {
      return
    }

    const assistants = await this.getAssistants()

    for (const assistant of assistants) {
      // Check if this assistant has the old instruction format
      if (assistant.instructions?.startsWith(OLD_INSTRUCTION)) {
        // Replace old instruction with new one, preserving the rest of the content
        const restOfInstructions = assistant.instructions.substring(
          OLD_INSTRUCTION.length
        )
        assistant.instructions = NEW_INSTRUCTION + restOfInstructions

        // Save the updated assistant
        const assistantPath = await joinPath([
          'file://assistants',
          assistant.id,
          'assistant.json',
        ])

        try {
          await fs.writeFileSync(
            assistantPath,
            JSON.stringify(assistant, null, 2)
          )
          console.log(`Migrated instructions for assistant: ${assistant.id}`)
        } catch (error) {
          console.error(`Failed to migrate assistant ${assistant.id}:`, error)
        }
      }
    }
  }

  /**
   * Migration v2: Update assistant instructions to Atomic Chat format and set default parameters
   */
  private async migrateToAtomicChatInstructions(): Promise<void> {
    const OLD_INSTRUCTION_PREFIX = 'You are Jan, a helpful AI assistant.'
    const NEW_INSTRUCTION = ATOMIC_CHAT_INSTRUCTIONS

    const DEFAULT_PARAMETERS = {
      temperature: 0.7,
      top_k: 20,
      top_p: 0.8,
      repeat_penalty: 1.12,
    }

    if (!(await fs.existsSync('file://assistants'))) {
      return
    }

    const assistants = await this.getAssistants()

    for (const assistant of assistants) {
      // Check if this assistant has the old instruction format
      if (assistant.instructions?.startsWith(OLD_INSTRUCTION_PREFIX)) {
        assistant.instructions = NEW_INSTRUCTION

        // Add default parameters to the assistant
        const assistantWithParams = {
          ...assistant,
          parameters: DEFAULT_PARAMETERS,
        }

        // Save the updated assistant
        const assistantPath = await joinPath([
          'file://assistants',
          assistant.id,
          'assistant.json',
        ])

        try {
          await fs.writeFileSync(
            assistantPath,
            JSON.stringify(assistantWithParams, null, 2)
          )
          console.log(
            `Migrated to Menlo instructions for assistant: ${assistant.id}`
          )
        } catch (error) {
          console.error(`Failed to migrate assistant ${assistant.id}:`, error)
        }
      }
    }
  }

  /**
   * Migration v3: stop instructing the model to narrate its thought process.
   * The v2 instructions told the assistant to "articulate your complete
   * thought process in natural language", which made models emit their
   * reasoning as plain text (shown outside the reasoning UI) and sometimes
   * omit the actual answer. Replace with the direct-answer format.
   */
  private async migrateToDirectAnswerInstructions(): Promise<void> {
    const OLD_FORMAT_MARKER = 'Mandatory logical analysis'

    if (!(await fs.existsSync('file://assistants'))) {
      return
    }

    const assistants = await this.getAssistants()

    for (const assistant of assistants) {
      if (
        !assistant.instructions?.includes(OLD_FORMAT_MARKER) &&
        !assistant.instructions?.startsWith('You are Jan,')
      ) {
        continue
      }

      assistant.instructions = ATOMIC_CHAT_INSTRUCTIONS

      const assistantPath = await joinPath([
        'file://assistants',
        assistant.id,
        'assistant.json',
      ])

      try {
        await fs.writeFileSync(
          assistantPath,
          JSON.stringify(assistant, null, 2)
        )
        console.log(
          `Migrated to direct-answer instructions for assistant: ${assistant.id}`
        )
      } catch (error) {
        console.error(`Failed to migrate assistant ${assistant.id}:`, error)
      }
    }
  }

  /**
   * Called when the extension is unloaded.
   */
  onUnload(): void {}

  async getAssistants(): Promise<Assistant[]> {
    if (!(await fs.existsSync('file://assistants')))
      return [this.defaultAssistant]
    const assistants = await fs.readdirSync('file://assistants')
    const assistantsData: Assistant[] = []
    for (const assistant of assistants) {
      const assistantPath = await joinPath([
        'file://assistants',
        assistant,
        'assistant.json',
      ])
      if (!(await fs.existsSync(assistantPath))) continue

      try {
        const assistantData = JSON.parse(await fs.readFileSync(assistantPath))
        assistantsData.push(assistantData as Assistant)
      } catch (error) {
        console.error(`Failed to read assistant ${assistant}:`, error)
      }
    }
    return assistantsData
  }

  async createAssistant(assistant: Assistant): Promise<void> {
    const assistantPath = await joinPath([
      'file://assistants',
      assistant.id,
      'assistant.json',
    ])
    const assistantFolder = await joinPath(['file://assistants', assistant.id])
    if (!(await fs.existsSync(assistantFolder))) {
      await fs.mkdir(assistantFolder)
    }
    await fs.writeFileSync(assistantPath, JSON.stringify(assistant, null, 2))
  }

  async deleteAssistant(assistant: Assistant): Promise<void> {
    const assistantPath = await joinPath([
      'file://assistants',
      assistant.id,
      'assistant.json',
    ])
    if (await fs.existsSync(assistantPath)) {
      await fs.rm(assistantPath)
    }
  }

  private defaultAssistant: Assistant = {
    avatar: '👋',
    thread_location: undefined,
    id: 'jan',
    object: 'assistant',
    created_at: Date.now() / 1000,
    name: 'Atomic Chat',
    description:
      'Atomic Chat is a helpful desktop assistant that can reason through complex tasks and use tools to complete them on the user’s behalf.',
    model: '*',
    instructions: ATOMIC_CHAT_INSTRUCTIONS,
    tools: [
      {
        type: 'retrieval',
        enabled: false,
        useTimeWeightedRetriever: false,
        settings: {
          top_k: 2,
          chunk_size: 1024,
          chunk_overlap: 64,
          retrieval_template: `Use the following pieces of context to answer the question at the end.
----------------
CONTEXT: {CONTEXT}
----------------
QUESTION: {QUESTION}
----------------
Helpful Answer:`,
        },
      },
    ],
    file_ids: [],
    metadata: undefined,
  }
}
