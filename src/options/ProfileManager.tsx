import React, { useState, useEffect, useRef } from 'react';
import type { CandidateProfile, ParsedResume, ScreeningAnswer, Address } from '../types/resume';
import { profilesDB } from '../storage/indexedDB';

// ============================================================
// Profile Manager Component
// src/options/ProfileManager.tsx
// ============================================================

function createEmptyProfile(name: string): CandidateProfile {
  return {
    id: crypto.randomUUID(),
    name,
    resumes: [],
    activeResumeId: '',
    personalInfo: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      address: { street: '', city: '', state: '', zipCode: '', country: '' },
    },
    workPreferences: {
      desiredTitles: [],
      desiredLocations: [],
      remotePreference: 'any',
      salaryExpectation: { min: 0, max: 0, currency: 'USD', period: 'annual' },
      noticePeriod: '',
      willingToRelocate: false,
      workAuthorization: '',
      requiresVisaSponsorship: false,
      openToContract: false,
      openToPartTime: false,
    },
    screeningAnswers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

type Tab = 'personal' | 'preferences' | 'resumes' | 'answers';

export function ProfileManager() {
  const [profiles, setProfiles] = useState<CandidateProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('personal');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Fetch profiles on load
  useEffect(() => {
    loadProfiles();
  }, []);

  async function loadProfiles() {
    const data = await profilesDB.getAll();
    setProfiles(data);
    if (data.length > 0 && !selectedId) {
      setSelectedId(data[0].id);
    } else if (data.length === 0) {
      // Create a default profile if none exists
      const defaultProfile = createEmptyProfile('Main Profile');
      await profilesDB.save(defaultProfile);
      setProfiles([defaultProfile]);
      setSelectedId(defaultProfile.id);
    }
  }

  async function saveProfile(updatedProfile: CandidateProfile) {
    setIsSaving(true);
    updatedProfile.updatedAt = new Date().toISOString();
    await profilesDB.save(updatedProfile);
    
    // Update local state
    setProfiles(prev => prev.map(p => p.id === updatedProfile.id ? updatedProfile : p));
    
    setSaveMessage('✓ Saved');
    setTimeout(() => setSaveMessage(''), 2000);
    setIsSaving(false);
  }

  async function handleCreateNew() {
    const name = prompt('Enter a name for the new profile (e.g., "Frontend Developer"):');
    if (!name?.trim()) return;
    
    const newProfile = createEmptyProfile(name.trim());
    await profilesDB.save(newProfile);
    setProfiles(prev => [...prev, newProfile]);
    setSelectedId(newProfile.id);
  }

  async function handleDeleteProfile(id: string) {
    if (!confirm('Are you sure you want to delete this profile? This cannot be undone.')) return;
    await profilesDB.delete(id);
    const updated = profiles.filter(p => p.id !== id);
    setProfiles(updated);
    if (updated.length > 0) {
      setSelectedId(updated[0].id);
    } else {
      setSelectedId(null);
      // Auto-create a new default if all are deleted
      loadProfiles();
    }
  }

  const selectedProfile = profiles.find(p => p.id === selectedId);

  return (
    <div style={{ display: 'flex', gap: '24px', height: '100%', alignItems: 'flex-start' }}>
      
      {/* Sidebar: Profile List */}
      <div style={{ 
        width: '240px', 
        background: 'var(--color-surface-2)', 
        borderRadius: 'var(--radius-lg)', 
        padding: '16px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        border: '1px solid var(--color-border)'
      }}>
        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', color: 'var(--color-text-muted)' }}>
          YOUR PROFILES
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {profiles.map(p => (
            <div 
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: selectedId === p.id ? 'var(--color-surface-3)' : 'transparent',
                border: `1px solid ${selectedId === p.id ? 'var(--color-border)' : 'transparent'}`,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>👤</span>
                <span style={{ fontSize: '13px', fontWeight: selectedId === p.id ? 600 : 400 }}>{p.name}</span>
              </div>
            </div>
          ))}
        </div>

        <button 
          className="btn-secondary" 
          onClick={handleCreateNew}
          style={{ marginTop: '8px', width: '100%', fontSize: '13px', padding: '8px' }}
        >
          + Create Profile
        </button>
      </div>

      {/* Main Content: Profile Details */}
      {selectedProfile ? (
        <div style={{ 
          flex: 1, 
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '600px',
        }}>
          {/* Header & Tabs */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <input 
                  type="text"
                  value={selectedProfile.name}
                  onChange={(e) => {
                    const updated = { ...selectedProfile, name: e.target.value };
                    setProfiles(prev => prev.map(p => p.id === updated.id ? updated : p));
                  }}
                  onBlur={() => saveProfile(selectedProfile)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '24px',
                    fontWeight: 700,
                    color: 'var(--color-text)',
                    outline: 'none',
                    width: '100%',
                    padding: '4px 0',
                    borderBottom: '1px dashed transparent',
                    cursor: 'text',
                  }}
                  onFocus={(e) => e.target.style.borderBottom = '1px dashed var(--color-primary)'}
                  onMouseLeave={(e) => (e.target as HTMLInputElement).blur()}
                />
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  ID: {selectedProfile.id.split('-')[0]} • Last updated: {new Date(selectedProfile.updatedAt).toLocaleDateString()}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {saveMessage && (
                  <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 600 }}>{saveMessage}</span>
                )}
                <button 
                  onClick={() => handleDeleteProfile(selectedProfile.id)}
                  style={{
                    background: 'transparent', border: 'none', color: '#ef4444', 
                    cursor: 'pointer', padding: '6px', borderRadius: '4px',
                    opacity: 0.8,
                  }}
                  title="Delete Profile"
                >
                  🗑️
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', borderBottom: '1px solid transparent' }}>
              {[
                { id: 'personal', label: 'Personal Info' },
                { id: 'preferences', label: 'Work Preferences' },
                { id: 'resumes', label: `Resumes (${selectedProfile.resumes.length})` },
                { id: 'answers', label: `Screening Answers (${selectedProfile.screeningAnswers.length})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '8px 4px', fontSize: '14px', fontWeight: activeTab === tab.id ? 600 : 400,
                    color: activeTab === tab.id ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                    borderBottom: `2px solid ${activeTab === tab.id ? 'var(--color-primary-light)' : 'transparent'}`,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
            {activeTab === 'personal' && (
              <PersonalInfoTab profile={selectedProfile} onSave={saveProfile} />
            )}
            {activeTab === 'preferences' && (
              <WorkPreferencesTab profile={selectedProfile} onSave={saveProfile} />
            )}
            {activeTab === 'resumes' && (
              <ResumesTab profile={selectedProfile} onSave={saveProfile} />
            )}
            {activeTab === 'answers' && (
              <ScreeningAnswersTab profile={selectedProfile} onSave={saveProfile} />
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
          Loading profile...
        </div>
      )}

    </div>
  );
}

// ============================================================
// Sub-components for Tabs
// ============================================================

function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
      {children}
    </div>
  );
}

function Field({ label, children, flex = 1 }: { label: string; children: React.ReactNode; flex?: number }) {
  return (
    <div style={{ flex, display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}

// ---- Personal Info Tab ----
function PersonalInfoTab({ profile, onSave }: { profile: CandidateProfile, onSave: (p: CandidateProfile) => void }) {
  const info = profile.personalInfo;

  // ponytail: Local state for inputs — save on blur, not on every keystroke
  const [local, setLocal] = useState(info);
  const isLocalRef = useRef(false);

  // Sync when profile changes externally
  useEffect(() => { if (!isLocalRef.current) setLocal(info); isLocalRef.current = false; }, [info]);

  const updateLocal = (updates: Partial<typeof info>) => {
    isLocalRef.current = true;
    setLocal(prev => ({ ...prev, ...updates }));
  };

  const saveField = () => {
    onSave({ ...profile, personalInfo: local });
  };

  const updateAddress = (updates: Partial<Address>) => {
    updateLocal({ address: { ...local.address, ...updates } });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Contact Information</h3>

      <FieldRow>
        <Field label="First Name">
          <input className="input" value={local.firstName} onChange={e => updateLocal({ firstName: e.target.value })} onBlur={saveField} placeholder="Jane" />
        </Field>
        <Field label="Last Name">
          <input className="input" value={local.lastName} onChange={e => updateLocal({ lastName: e.target.value })} onBlur={saveField} placeholder="Doe" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Email Address">
          <input className="input" type="email" value={local.email} onChange={e => updateLocal({ email: e.target.value })} onBlur={saveField} placeholder="jane.doe@example.com" />
        </Field>
        <Field label="Phone Number">
          <input className="input" type="tel" value={local.phone} onChange={e => updateLocal({ phone: e.target.value })} onBlur={saveField} placeholder="+1 (555) 123-4567" />
        </Field>
      </FieldRow>

      <h3 style={{ fontSize: '16px', marginTop: '16px', marginBottom: '16px' }}>Location</h3>

      <FieldRow>
        <Field label="Street Address">
          <input className="input" value={local.address?.street || ''} onChange={e => updateAddress({ street: e.target.value })} onBlur={saveField} placeholder="123 Main St, Apt 4B" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="City">
          <input className="input" value={local.address?.city || ''} onChange={e => updateAddress({ city: e.target.value })} onBlur={saveField} placeholder="San Francisco" />
        </Field>
        <Field label="State / Province">
          <input className="input" value={local.address?.state || ''} onChange={e => updateAddress({ state: e.target.value })} onBlur={saveField} placeholder="CA" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Zip / Postal Code">
          <input className="input" value={local.address?.zipCode || ''} onChange={e => updateAddress({ zipCode: e.target.value })} onBlur={saveField} placeholder="94105" />
        </Field>
        <Field label="Country">
          <input className="input" value={local.address?.country || ''} onChange={e => updateAddress({ country: e.target.value })} onBlur={saveField} placeholder="United States" />
        </Field>
      </FieldRow>

      <h3 style={{ fontSize: '16px', marginTop: '16px', marginBottom: '16px' }}>Additional Details</h3>

      <FieldRow>
        <Field label="Nationality">
          <input className="input" value={local.nationality || ''} onChange={e => updateLocal({ nationality: e.target.value })} onBlur={saveField} placeholder="e.g. US Citizen" />
        </Field>
        <Field label="Pronouns">
          <input className="input" value={local.pronouns || ''} onChange={e => updateLocal({ pronouns: e.target.value })} onBlur={saveField} placeholder="e.g. she/her" />
        </Field>
      </FieldRow>
    </div>
  );
}

// ---- Work Preferences Tab ----
function WorkPreferencesTab({ profile, onSave }: { profile: CandidateProfile, onSave: (p: CandidateProfile) => void }) {
  const prefs = profile.workPreferences;

  // ponytail: Debounce saves — 500ms after last change
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const debouncedSave = (updates: Partial<typeof prefs>) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onSave({ ...profile, workPreferences: { ...prefs, ...updates } });
    }, 500);
  };

  const handleArrayInput = (key: 'desiredTitles' | 'desiredLocations', value: string) => {
    const arr = value.split(',').map(s => s.trim()).filter(Boolean);
    debouncedSave({ [key]: arr });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      <FieldRow>
        <Field label="Desired Job Titles (comma-separated)">
          <input
            className="input"
            defaultValue={prefs.desiredTitles.join(', ')}
            onBlur={e => handleArrayInput('desiredTitles', e.target.value)}
            placeholder="Software Engineer, Frontend Developer, Full Stack..."
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Desired Locations (comma-separated)">
          <input
            className="input"
            defaultValue={prefs.desiredLocations.join(', ')}
            onBlur={e => handleArrayInput('desiredLocations', e.target.value)}
            placeholder="San Francisco, New York, Remote..."
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Remote Preference">
          <select className="input" value={prefs.remotePreference} onChange={e => debouncedSave({ remotePreference: e.target.value as any })}>
            <option value="any">Any (Remote, Hybrid, Onsite)</option>
            <option value="remote">Fully Remote Only</option>
            <option value="hybrid">Hybrid Only</option>
            <option value="onsite">Onsite Only</option>
          </select>
        </Field>
        <Field label="Willing to Relocate">
          <select className="input" value={prefs.willingToRelocate ? 'yes' : 'no'} onChange={e => debouncedSave({ willingToRelocate: e.target.value === 'yes' })}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </FieldRow>

      <div style={{ height: '1px', background: 'var(--color-border)', margin: '16px 0' }} />

      <FieldRow>
        <Field label="Minimum Salary Expectation">
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              className="input" 
              type="number" 
              value={prefs.salaryExpectation?.min || 0} 
              onChange={e => debouncedSave({ salaryExpectation: { ...prefs.salaryExpectation, min: Number(e.target.value) } })} 
              style={{ width: '120px' }}
            />
            <select 
              className="input" 
              value={prefs.salaryExpectation?.currency || 'USD'} 
              onChange={e => debouncedSave({ salaryExpectation: { ...prefs.salaryExpectation, currency: e.target.value } })}
              style={{ width: '80px' }}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
            </select>
            <select 
              className="input" 
              value={prefs.salaryExpectation?.period || 'annual'} 
              onChange={e => debouncedSave({ salaryExpectation: { ...prefs.salaryExpectation, period: e.target.value as any } })}
              style={{ flex: 1 }}
            >
              <option value="annual">Per Year</option>
              <option value="hourly">Per Hour</option>
            </select>
          </div>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Notice Period">
          <input className="input" value={prefs.noticePeriod || ''} onChange={e => debouncedSave({ noticePeriod: e.target.value })} placeholder="e.g. 2 weeks, Immediately" />
        </Field>
        <Field label="Work Authorization">
          <input className="input" value={prefs.workAuthorization || ''} onChange={e => debouncedSave({ workAuthorization: e.target.value })} placeholder="e.g. US Citizen, H1B" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Requires Visa Sponsorship">
          <select className="input" value={prefs.requiresVisaSponsorship ? 'yes' : 'no'} onChange={e => debouncedSave({ requiresVisaSponsorship: e.target.value === 'yes' })}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Open to Contract Roles">
          <select className="input" value={prefs.openToContract ? 'yes' : 'no'} onChange={e => debouncedSave({ openToContract: e.target.value === 'yes' })}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
        <Field label="Open to Part-time Roles">
          <select className="input" value={prefs.openToPartTime ? 'yes' : 'no'} onChange={e => debouncedSave({ openToPartTime: e.target.value === 'yes' })}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </FieldRow>

    </div>
  );
}

// ---- Resumes Tab ----
function ResumesTab({ profile, onSave }: { profile: CandidateProfile, onSave: (p: CandidateProfile) => void }) {
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleDeleteResume = (resumeId: string) => {
    if (!confirm('Remove this resume from the profile?')) return;
    const updatedResumes = profile.resumes.filter(r => r.id !== resumeId);
    let newActiveId = profile.activeResumeId;
    if (newActiveId === resumeId) {
      newActiveId = updatedResumes.length > 0 ? updatedResumes[0].id : '';
    }
    onSave({ ...profile, resumes: updatedResumes, activeResumeId: newActiveId });
  };

  const handleSetActive = (resumeId: string) => {
    onSave({ ...profile, activeResumeId: resumeId });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const data = Array.from(new Uint8Array(buffer));
      
      const response = await chrome.runtime.sendMessage({
        type: 'UPLOAD_RESUME',
        payload: {
          data,
          type: file.type,
          fileName: file.name
        }
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to parse resume');
      }

      const parsedResume = response.data;
      const updatedResumes = [...profile.resumes, parsedResume];
      onSave({ 
        ...profile, 
        resumes: updatedResumes, 
        activeResumeId: profile.activeResumeId || parsedResume.id 
      });

    } catch (err) {
      alert(`Error uploading resume: ${err}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0 }}>
          Upload your PDF or DOCX resume. The local AI will parse and extract your experience to fill out applications.
        </p>
        
        <input 
          type="file" 
          accept=".pdf,.docx" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileUpload} 
        />
        
        <button 
          className="btn-primary" 
          onClick={() => fileInputRef.current?.click()} 
          disabled={isUploading}
          style={{ padding: '8px 16px', fontSize: '13px', minWidth: '160px' }}
        >
          {isUploading ? '🤖 Parsing with AI...' : '📤 Upload Resume'}
        </button>
      </div>

      {profile.resumes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
          No resumes uploaded for this profile yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {profile.resumes.map(resume => (
            <div key={resume.id} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '16px',
              background: 'var(--color-surface-3)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${profile.activeResumeId === resume.id ? 'var(--color-primary)' : 'var(--color-border)'}`
            }}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ fontSize: '24px' }}>📄</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                    {resume.name || resume.fileName || 'Untitled Resume'}
                    {profile.activeResumeId === resume.id && (
                      <span style={{ 
                        marginLeft: '8px', padding: '2px 6px', 
                        background: 'var(--gradient-brand)', color: 'white', 
                        fontSize: '10px', borderRadius: '4px', fontWeight: 700 
                      }}>ACTIVE</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Uploaded: {new Date(resume.createdAt).toLocaleDateString()} • {resume.experience?.length || 0} roles parsed
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {profile.activeResumeId !== resume.id && (
                  <button className="btn-secondary" onClick={() => handleSetActive(resume.id)} style={{ padding: '6px 12px', fontSize: '12px' }}>
                    Set Active
                  </button>
                )}
                <button 
                  onClick={() => handleDeleteResume(resume.id)}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', 
                    color: '#ef4444', cursor: 'pointer', padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                  }}
                  title="Delete Resume"
                >
                  🗑️
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// ---- Screening Answers Tab ----
function ScreeningAnswersTab({ profile, onSave }: { profile: CandidateProfile, onSave: (p: CandidateProfile) => void }) {
  
  const [isAdding, setIsAdding] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');

  const handleDelete = (id: string) => {
    if (!confirm('Delete this saved answer?')) return;
    onSave({ ...profile, screeningAnswers: profile.screeningAnswers.filter(a => a.id !== id) });
  };

  const handleAdd = () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    const answer: ScreeningAnswer = {
      id: crypto.randomUUID(),
      questionPattern: newQuestion.trim(),
      answer: newAnswer.trim(),
      category: 'custom',
      lastUsed: new Date().toISOString(),
      useCount: 0,
    };
    onSave({ ...profile, screeningAnswers: [...profile.screeningAnswers, answer] });
    setNewQuestion('');
    setNewAnswer('');
    setIsAdding(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0 }}>
          Saved answers are used by the AI to automatically fill out screening questions on job applications.
        </p>
        <button className="btn-primary" onClick={() => setIsAdding(!isAdding)} style={{ padding: '6px 12px', fontSize: '12px' }}>
          {isAdding ? 'Cancel' : '+ Add Rule'}
        </button>
      </div>

      {isAdding && (
        <div style={{ 
          padding: '16px', background: 'var(--color-surface-3)', 
          borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
          display: 'flex', flexDirection: 'column', gap: '12px'
        }}>
          <Field label="If a question contains (keywords or pattern):">
            <input className="input" value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="e.g. sponsorship, github url, highest education" />
          </Field>
          <Field label="Always answer with:">
            <textarea className="input" value={newAnswer} onChange={e => setNewAnswer(e.target.value)} placeholder="e.g. No, https://github.com/myname, Bachelor's" style={{ minHeight: '60px', resize: 'vertical' }} />
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={handleAdd}>Save Rule</button>
          </div>
        </div>
      )}

      {profile.screeningAnswers.length === 0 && !isAdding ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
          No custom screening answers saved yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {profile.screeningAnswers.map(ans => (
            <div key={ans.id} style={{ 
              padding: '12px', background: 'var(--color-surface-3)', 
              borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
            }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-primary-light)', fontWeight: 600, marginBottom: '4px' }}>
                  IF MATCHES: <span style={{ color: 'var(--color-text)' }}>{ans.questionPattern}</span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>
                  ↳ {ans.answer}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                  Used {ans.useCount} times • Last used: {new Date(ans.lastUsed).toLocaleDateString()}
                </div>
              </div>
              <button 
                onClick={() => handleDelete(ans.id)}
                style={{
                  background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
