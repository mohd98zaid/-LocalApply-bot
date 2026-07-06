import React, { useState, useEffect, useCallback } from 'react';
import type { ApplicationQuestion } from '../../types/ai';
import type { PageAnalysis } from '../../types/messages';

// ============================================================
// Answer Review Panel — AI Q&A with streaming display + memory
// src/sidepanel/components/AnswerReviewPanel.tsx
// ============================================================

interface AnswerDraft {
  questionId: string;
  question: ApplicationQuestion;
  answer: string;
  confidence: number;
  reasoning: string;
  status: 'pending' | 'generating' | 'ready' | 'approved' | 'rejected' | 'edited';
}

interface AnswerReviewPanelProps {
  pageAnalysis: PageAnalysis | null;
}

export function AnswerReviewPanel({ pageAnalysis }: AnswerReviewPanelProps) {
  const [drafts, setDrafts] = useState<AnswerDraft[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const questions = pageAnalysis?.questions ?? [];

  useEffect(() => {
    // Initialize drafts from detected questions
    const initial = questions.map(q => ({
      questionId: q.id,
      question: q,
      answer: '',
      confidence: 0,
      reasoning: '',
      status: 'pending' as const,
    }));
    setDrafts(initial);
  }, [pageAnalysis?.url]);

  const generateAll = useCallback(async () => {
    if (questions.length === 0) return;
    setIsGenerating(true);

    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS', payload: {} });
    const profileId = settings?.data?.activeProfileId;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      setDrafts(prev => prev.map(d =>
        d.questionId === q.id ? { ...d, status: 'generating' } : d
      ));
      setActiveIdx(i);

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GENERATE_ANSWER',
          payload: {
            question: q,
            context: {
              question: { text: q.text, category: q.category, maxLength: q.maxLength },
              resume: { relevantExperience: '', relevantSkills: [] },
              jobDescription: {
                title: pageAnalysis?.jobDescription?.title ?? '',
                company: pageAnalysis?.jobDescription?.company?.name ?? '',
                requirements: pageAnalysis?.jobDescription?.requirements?.required ?? [],
                description: pageAnalysis?.jobDescription?.rawDescription ?? '',
              },
              previousAnswers: [],
              userPreferences: {
                tone: settings?.data?.answers?.tone ?? 'professional',
                length: settings?.data?.answers?.length ?? 'moderate',
              },
            },
          },
        });

        if (response?.success && response.data?.answer) {
          setDrafts(prev => prev.map(d =>
            d.questionId === q.id ? {
              ...d,
              answer: response.data.answer,
              confidence: response.data.confidence ?? 0.7,
              reasoning: response.data.reasoning ?? '',
              status: 'ready',
            } : d
          ));
        } else {
          setDrafts(prev => prev.map(d =>
            d.questionId === q.id ? { ...d, status: 'rejected' } : d
          ));
        }
      } catch {
        setDrafts(prev => prev.map(d =>
          d.questionId === q.id ? { ...d, status: 'rejected' } : d
        ));
      }
    }

    setIsGenerating(false);
  }, [questions, pageAnalysis]);

  const generateSingle = async (draft: AnswerDraft) => {
    setDrafts(prev => prev.map(d =>
      d.questionId === draft.questionId ? { ...d, status: 'generating' } : d
    ));

    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS', payload: {} });

    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_ANSWER',
      payload: {
        question: draft.question,
        context: {
          question: { text: draft.question.text, category: draft.question.category },
          resume: { relevantExperience: '', relevantSkills: [] },
          jobDescription: {
            title: pageAnalysis?.jobDescription?.title ?? '',
            company: pageAnalysis?.jobDescription?.company?.name ?? '',
            requirements: [],
            description: pageAnalysis?.jobDescription?.rawDescription ?? '',
          },
          previousAnswers: [],
          userPreferences: {
            tone: settings?.data?.answers?.tone ?? 'professional',
            length: settings?.data?.answers?.length ?? 'moderate',
          },
        },
      },
    });

    setDrafts(prev => prev.map(d =>
      d.questionId === draft.questionId ? {
        ...d,
        answer: response?.data?.answer ?? 'Generation failed',
        confidence: response?.data?.confidence ?? 0,
        status: response?.success ? 'ready' : 'rejected',
      } : d
    ));
  };

  const approveAndInsert = async (draft: AnswerDraft) => {
    // Send answer to content script to insert into field
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'FILL_FIELD',
        payload: { field: draft.question, value: draft.answer },
      });
    }

    setDrafts(prev => prev.map(d =>
      d.questionId === draft.questionId ? { ...d, status: 'approved' } : d
    ));
  };

  const startEdit = (draft: AnswerDraft) => {
    setEditingId(draft.questionId);
    setEditText(draft.answer);
  };

  const saveEdit = (questionId: string) => {
    setDrafts(prev => prev.map(d =>
      d.questionId === questionId ? { ...d, answer: editText, status: 'edited' } : d
    ));
    setEditingId(null);
  };

  if (questions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
        <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--color-text)' }}>No Questions Detected</div>
        <div style={{ fontSize: 12 }}>Application screening questions will appear here when detected</div>
      </div>
    );
  }

  const currentDraft = drafts[activeIdx];
  const readyCount = drafts.filter(d => ['ready', 'edited', 'approved'].includes(d.status)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Summary bar */}
      <div className="glass-card" style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{questions.length} Questions</span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 12, marginLeft: 8 }}>
              {readyCount} answered
            </span>
          </div>
          <button
            className="btn-primary"
            onClick={generateAll}
            disabled={isGenerating}
            style={{ fontSize: 12, padding: '6px 12px' }}
          >
            {isGenerating ? '⟳ Generating...' : '⚡ Answer All'}
          </button>
        </div>
      </div>

      {/* Question pills */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {drafts.map((d, i) => (
          <button
            key={d.questionId}
            onClick={() => setActiveIdx(i)}
            style={{
              padding: '4px 8px', borderRadius: 100, fontSize: 11, fontWeight: 600,
              border: `1px solid ${activeIdx === i ? 'rgba(99,102,241,0.5)' : 'var(--color-border)'}`,
              background: activeIdx === i ? 'rgba(99,102,241,0.15)' : 'var(--color-surface-2)',
              color: activeIdx === i ? 'var(--color-primary-light)' : statusColor(d.status),
              cursor: 'pointer',
            }}
          >
            {statusIcon(d.status)} Q{i + 1}
          </button>
        ))}
      </div>

      {/* Active question */}
      {currentDraft && (
        <div className="glass-card animate-fade-in" style={{ padding: '12px' }}>

          {/* Question text */}
          <div style={{
            fontSize: 12, fontWeight: 600, marginBottom: 6,
            color: 'var(--color-text)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          }}>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{currentDraft.question.text}</span>
            <span className={`badge ${categoryBadge(currentDraft.question.category)}`} style={{ marginLeft: 8, flexShrink: 0 }}>
              {currentDraft.question.category}
            </span>
          </div>

          {currentDraft.question.required && (
            <div style={{ fontSize: 10, color: '#ef4444', marginBottom: 8 }}>* Required</div>
          )}

          {currentDraft.question.maxLength && (
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 8 }}>
              Max {currentDraft.question.maxLength} characters
              {currentDraft.answer && ` · ${currentDraft.answer.length} used`}
            </div>
          )}

          <div className="divider" />

          {/* Answer area */}
          {currentDraft.status === 'generating' ? (
            <div style={{ padding: '12px 0', color: 'var(--color-text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 14, height: 14, border: '2px solid var(--color-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              Generating with AI...
            </div>
          ) : currentDraft.status === 'pending' ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <button
                className="btn-secondary"
                onClick={() => generateSingle(currentDraft)}
                style={{ fontSize: 12 }}
              >
                🤖 Generate Answer
              </button>
            </div>
          ) : editingId === currentDraft.questionId ? (
            <div>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                maxLength={currentDraft.question.maxLength}
                style={{
                  width: '100%', minHeight: 100,
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-primary)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text)',
                  padding: '8px', fontSize: 12,
                  fontFamily: 'inherit', resize: 'vertical',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="btn-primary" onClick={() => saveEdit(currentDraft.questionId)} style={{ fontSize: 11 }}>
                  ✓ Save Edit
                </button>
                <button className="btn-ghost" onClick={() => setEditingId(null)} style={{ fontSize: 11 }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              {/* Confidence bar */}
              {currentDraft.confidence > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 3 }}>
                    <span>AI Confidence</span>
                    <span style={{ color: confidenceColor(currentDraft.confidence) }}>
                      {Math.round(currentDraft.confidence * 100)}%
                    </span>
                  </div>
                  <div style={{ height: 3, background: 'var(--color-surface-2)', borderRadius: 2 }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${currentDraft.confidence * 100}%`,
                      background: confidenceColor(currentDraft.confidence),
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              )}

              {/* Answer text */}
              <div style={{
                fontSize: 12, lineHeight: 1.7,
                color: currentDraft.status === 'approved' ? '#10b981' : 'var(--color-text)',
                background: 'var(--color-surface-2)',
                borderRadius: 'var(--radius-md)',
                padding: '10px',
                border: `1px solid ${currentDraft.status === 'approved' ? 'rgba(16,185,129,0.3)' : 'var(--color-border)'}`,
                whiteSpace: 'pre-wrap',
                maxHeight: 180,
                overflow: 'auto',
              }}>
                {currentDraft.answer}
              </div>

              {/* Action row */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {currentDraft.status !== 'approved' && (
                  <button
                    className="btn-primary"
                    onClick={() => approveAndInsert(currentDraft)}
                    style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}
                  >
                    ✓ Insert into Field
                  </button>
                )}
                <button className="btn-secondary" onClick={() => startEdit(currentDraft)} style={{ fontSize: 11 }}>
                  ✏️ Edit
                </button>
                <button className="btn-ghost" onClick={() => generateSingle(currentDraft)} style={{ fontSize: 11 }}>
                  ⟳
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => navigator.clipboard.writeText(currentDraft.answer)}
                  style={{ fontSize: 11 }}
                  title="Copy to clipboard"
                >
                  📋
                </button>
              </div>

              {/* Reasoning */}
              {currentDraft.reasoning && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 11, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                    View AI reasoning
                  </summary>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.6, fontStyle: 'italic' }}>
                    {currentDraft.reasoning}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* Approve all */}
      {readyCount === questions.length && readyCount > 0 && (
        <button
          className="btn-primary"
          onClick={() => drafts.forEach(d => d.status !== 'approved' && approveAndInsert(d))}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          ✓ Insert All Approved Answers
        </button>
      )}
    </div>
  );
}

// ---- Helpers ----

function statusIcon(status: AnswerDraft['status']): string {
  const icons: Record<AnswerDraft['status'], string> = {
    pending: '○', generating: '⟳', ready: '●',
    approved: '✓', rejected: '✗', edited: '✎',
  };
  return icons[status];
}

function statusColor(status: AnswerDraft['status']): string {
  if (status === 'approved') return '#10b981';
  if (status === 'ready' || status === 'edited') return 'var(--color-primary-light)';
  if (status === 'rejected') return '#ef4444';
  return 'var(--color-text-muted)';
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.75) return '#10b981';
  if (confidence >= 0.5) return '#f59e0b';
  return '#ef4444';
}

function categoryBadge(category: string): string {
  const map: Record<string, string> = {
    behavioral: 'badge-info', salary: 'badge-warning',
    visa: 'badge-warning', relocation: 'badge-warning',
    availability: 'badge-neutral', experience: 'badge-info',
    education: 'badge-neutral', custom: 'badge-neutral',
  };
  return map[category] ?? 'badge-neutral';
}
