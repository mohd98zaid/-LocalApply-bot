// ============================================================
// Message Router — Central dispatcher for all cross-context messages
// src/background/messageRouter.ts
// ============================================================

import type { MessageType } from '../types/messages';
import { getOllamaClient } from '../ai/ollama/client';
import { getSettings, saveSettings } from '../storage/chromeStorage';
import { profilesDB, jobsDB, applicationsDB } from '../storage/indexedDB';

interface MessageSender {
  tab?: chrome.tabs.Tab;
  frameId?: number;
  id?: string;
}

type ResponseCallback = (response: unknown) => void;

class MessageRouter {
  async handle(
    message: { type: MessageType; payload: unknown; requestId?: string },
    sender: MessageSender,
    sendResponse: ResponseCallback
  ): Promise<void> {
    const { type, payload, requestId } = message;

    console.debug('[LocalApply Router]', type, payload);

    try {
      const result = await this.dispatch(type, payload, sender);
      sendResponse({ success: true, data: result, requestId });
    } catch (error) {
      console.error('[LocalApply Router] Error handling', type, error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        requestId,
      });
    }
  }

  private async dispatch(
    type: MessageType,
    payload: unknown,
    sender: MessageSender
  ): Promise<unknown> {
    switch (type) {

      // ---- Ollama ----

      case 'CHECK_OLLAMA_STATUS': {
        const settings = await getSettings();
        const client = getOllamaClient(settings.ai.ollamaUrl);
        const status = await client.getStatus();
        const models = status.models.map(m => m.name);
        status.primaryModelAvailable = models.some(m =>
          m === settings.ai.primaryModel || m.startsWith(settings.ai.primaryModel + ':')
        );
        status.embeddingModelAvailable = models.some(m =>
          m === settings.ai.embeddingModel || m.startsWith(settings.ai.embeddingModel + ':')
        );
        return status;
      }

      // ---- Settings ----

      case 'GET_SETTINGS': {
        return getSettings();
      }

      case 'SAVE_SETTINGS': {
        return saveSettings(payload as Parameters<typeof saveSettings>[0]);
      }

      // ---- Profile ----

      case 'GET_PROFILE': {
        const { profileId } = payload as { profileId: string };
        return profilesDB.get(profileId);
      }

      case 'SAVE_PROFILE': {
        const profile = payload as Parameters<typeof profilesDB.save>[0];
        await profilesDB.save(profile);
        return profile;
      }

      // ---- Resumes ----

      case 'UPLOAD_RESUME': {
        const { data, type: mimeType, fileName } = payload as { data: number[]; type: string; fileName: string };
        const { parseResumeFile } = await import('./resumeParser');
        // Convert number[] back to ArrayBuffer
        const buffer = new Uint8Array(data).buffer;
        return parseResumeFile(buffer, mimeType, fileName);
      }

      // ---- Jobs ----

      case 'MATCH_JOB': {
        const { resumeId, jobId } = payload as { resumeId: string; jobId: string };
        return this.matchJobToResume(resumeId, jobId);
      }

      // ---- Applications ----

      case 'SAVE_APPLICATION': {
        const app = payload as Parameters<typeof applicationsDB.save>[0];
        await applicationsDB.save(app);
        return app;
      }

      case 'GET_APPLICATIONS': {
        return applicationsDB.getAll();
      }

      // ---- AI Tasks ----

      case 'GENERATE_ANSWER': {
        const { question, context } = payload as {
          question: import('../types/ai').ApplicationQuestion;
          context: import('../types/ai').AnswerContext;
        };
        return this.generateAnswer(question, context);
      }

      case 'GENERATE_COVER_LETTER': {
        const { profileId, jobId, tone } = payload as { profileId: string; jobId: string; tone: string };
        return this.generateCoverLetter(profileId, jobId, tone);
      }

      // ---- Page Analysis (relay to content script) ----

      case 'PAGE_ANALYSIS_RESULT': {
        // Store analysis result from content script
        const { saveTabAnalysis } = await import('../storage/chromeStorage');
        if (sender.tab?.id) {
          await saveTabAnalysis(sender.tab.id, payload);
        }
        // Broadcast to side panel
        chrome.runtime.sendMessage({ type: 'PAGE_ANALYSIS_RESULT', payload });
        return null;
      }

      case 'ANALYZE_PAGE': {
        const { tabId } = payload as { tabId: number };
        // Inject content script command
        await chrome.tabs.sendMessage(tabId, { type: 'ANALYZE_PAGE', payload: {} });
        return null;
      }

      // ---- Autofill (relay to content script) ----

      case 'START_AUTOFILL': {
        const tabId = sender.tab?.id ?? (payload as { tabId?: number }).tabId;
        if (tabId) {
          await chrome.tabs.sendMessage(tabId, { type: 'START_AUTOFILL', payload });
        }
        return null;
      }

      case 'FILL_RESULT': {
        // Relay fill result from content script to side panel
        chrome.runtime.sendMessage({ type: 'FILL_RESULT', payload });
        return null;
      }

      default:
        console.warn('[LocalApply Router] Unknown message type:', type);
        return null;
    }
  }

  // ---- AI Helpers ----

  private async generateAnswer(
    question: import('../types/ai').ApplicationQuestion,
    context: import('../types/ai').AnswerContext
  ) {
    const settings = await getSettings();
    const client = getOllamaClient(settings.ai.ollamaUrl);
    const { QUESTION_ANSWERER_PROMPT, interpolatePrompt } = await import('../ai/prompts/index');

    const userPrompt = interpolatePrompt(QUESTION_ANSWERER_PROMPT.userPromptTemplate, {
      questionText: question.text,
      questionCategory: question.category,
      maxLength: String(question.maxLength ?? 'unlimited'),
      profileSummary: context.resume.summary ?? '',
      relevantExperience: context.resume.relevantExperience,
      jobTitle: context.jobDescription.title,
      companyName: context.jobDescription.company,
      requirements: context.jobDescription.requirements.join('\n'),
      pastAnswers: context.previousAnswers
        .map(a => `Q: ${a.question}\nA: ${a.answer}`)
        .join('\n---\n'),
    });

    return client.generateJSON({
      model: settings.ai.primaryModel,
      messages: [
        { role: 'system', content: QUESTION_ANSWERER_PROMPT.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: QUESTION_ANSWERER_PROMPT.temperature,
        num_predict: QUESTION_ANSWERER_PROMPT.maxTokens,
      },
    });
  }

  private async generateCoverLetter(profileId: string, jobId: string, tone: string) {
    const settings = await getSettings();
    const client = getOllamaClient(settings.ai.ollamaUrl);
    const profile = await profilesDB.get(profileId);
    const job = await jobsDB.get(jobId);

    if (!profile || !job) throw new Error('Profile or job not found');

    const { COVER_LETTER_PROMPT, interpolatePrompt } = await import('../ai/prompts/index');
    const activeResume = profile.resumes.find(r => r.id === profile.activeResumeId);

    const userPrompt = interpolatePrompt(COVER_LETTER_PROMPT.userPromptTemplate, {
      candidateName: `${profile.personalInfo.firstName} ${profile.personalInfo.lastName}`,
      candidateSummary: activeResume?.summary ?? '',
      topAchievements: activeResume?.experience
        .slice(0, 2)
        .flatMap(e => e.bullets.slice(0, 2))
        .join('\n') ?? '',
      skills: activeResume?.skills
        .flatMap(s => s.skills.map(sk => sk.name))
        .slice(0, 15)
        .join(', ') ?? '',
      jobTitle: job.parsed.title,
      companyName: job.parsed.company.name,
      requirements: job.parsed.requirements.required.join('\n'),
      companyContext: job.parsed.company.mission ?? job.parsed.company.description ?? '',
      tone,
    });

    return client.generateJSON({
      model: settings.ai.primaryModel,
      messages: [
        { role: 'system', content: COVER_LETTER_PROMPT.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: COVER_LETTER_PROMPT.temperature,
        num_predict: COVER_LETTER_PROMPT.maxTokens,
      },
    });
  }

  private async matchJobToResume(resumeId: string, jobId: string) {
    const settings = await getSettings();
    const client = getOllamaClient(settings.ai.ollamaUrl);
    const job = await jobsDB.get(jobId);

    if (!job) throw new Error('Job not found');

    // Find resume across all profiles
    const profiles = await profilesDB.getAll();
    let resume = null;
    for (const profile of profiles) {
      resume = profile.resumes.find(r => r.id === resumeId);
      if (resume) break;
    }

    if (!resume) throw new Error('Resume not found');

    const { JOB_MATCHER_PROMPT, interpolatePrompt } = await import('../ai/prompts/index');

    const resumeSummary = [
      `Name: ${resume.contact.fullName}`,
      `Experience: ${resume.metadata.totalYearsExperience} years`,
      `Skills: ${resume.skills.flatMap(s => s.skills.map(sk => sk.name)).join(', ')}`,
      `Latest role: ${resume.experience[0]?.title} at ${resume.experience[0]?.company}`,
      resume.summary ?? '',
    ].join('\n');

    const userPrompt = interpolatePrompt(JOB_MATCHER_PROMPT.userPromptTemplate, {
      resumeSummary,
      jobDescription: job.parsed.rawDescription,
    });

    return client.generateJSON({
      model: settings.ai.primaryModel,
      messages: [
        { role: 'system', content: JOB_MATCHER_PROMPT.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: JOB_MATCHER_PROMPT.temperature,
        num_predict: JOB_MATCHER_PROMPT.maxTokens,
      },
    });
  }
}

export const messageRouter = new MessageRouter();
