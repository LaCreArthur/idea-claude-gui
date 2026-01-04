import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

export interface AskUserQuestionRequest {
  requestId: string;
  questions: Question[];
}

interface AskUserQuestionDialogProps {
  isOpen: boolean;
  request: AskUserQuestionRequest | null;
  onSubmit: (requestId: string, answers: Record<string, string>) => void;
  onCancel: (requestId: string) => void;
}

const AskUserQuestionDialog = ({
  isOpen,
  request,
  onSubmit,
  onCancel,
}: AskUserQuestionDialogProps) => {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [otherInputs, setOtherInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && request) {
      // Initialize answers
      const initialAnswers: Record<string, string | string[]> = {};
      const initialOtherInputs: Record<string, string> = {};
      request.questions.forEach((q, idx) => {
        const key = q.header || `q${idx}`;
        initialAnswers[key] = q.multiSelect ? [] : '';
        initialOtherInputs[key] = '';
      });
      setAnswers(initialAnswers);
      setOtherInputs(initialOtherInputs);

      // Handle Escape key
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, request]);

  if (!isOpen || !request) {
    return null;
  }

  const handleCancel = () => {
    onCancel(request.requestId);
  };

  const handleSubmit = () => {
    // Build final answers object
    const finalAnswers: Record<string, string> = {};
    request.questions.forEach((q, idx) => {
      const key = q.header || `q${idx}`;
      const answer = answers[key];
      const otherInput = otherInputs[key];

      if (otherInput) {
        // If "Other" input has content, use that
        finalAnswers[key] = otherInput;
      } else if (Array.isArray(answer)) {
        // Multi-select: join answers
        finalAnswers[key] = answer.join(', ');
      } else {
        finalAnswers[key] = answer || '';
      }
    });
    onSubmit(request.requestId, finalAnswers);
  };

  const handleOptionClick = (questionKey: string, optionLabel: string, multiSelect: boolean) => {
    if (multiSelect) {
      setAnswers(prev => {
        const current = (prev[questionKey] as string[]) || [];
        if (current.includes(optionLabel)) {
          return { ...prev, [questionKey]: current.filter(o => o !== optionLabel) };
        }
        return { ...prev, [questionKey]: [...current, optionLabel] };
      });
    } else {
      setAnswers(prev => ({ ...prev, [questionKey]: optionLabel }));
      // Clear other input when selecting an option
      setOtherInputs(prev => ({ ...prev, [questionKey]: '' }));
    }
  };

  const isOptionSelected = (questionKey: string, optionLabel: string, multiSelect: boolean): boolean => {
    const answer = answers[questionKey];
    if (multiSelect) {
      return Array.isArray(answer) && answer.includes(optionLabel);
    }
    return answer === optionLabel;
  };

  const handleOtherInputChange = (questionKey: string, value: string) => {
    setOtherInputs(prev => ({ ...prev, [questionKey]: value }));
    // Clear option selection when typing in Other
    if (value) {
      setAnswers(prev => ({ ...prev, [questionKey]: '' }));
    }
  };

  const hasValidAnswer = (): boolean => {
    // At least one question should have an answer
    return request.questions.some((q, idx) => {
      const key = q.header || `q${idx}`;
      const answer = answers[key];
      const otherInput = otherInputs[key];
      if (otherInput) return true;
      if (Array.isArray(answer)) return answer.length > 0;
      return !!answer;
    });
  };

  return (
    <div className="permission-dialog-overlay">
      <div className="ask-user-question-dialog">
        <h3 className="ask-user-question-title">{t('askUserQuestion.title')}</h3>

        <div className="ask-user-question-content">
          {request.questions.map((question, idx) => {
            const key = question.header || `q${idx}`;
            return (
              <div key={key} className="question-section">
                <div className="question-header">
                  <span className="question-chip">{question.header}</span>
                </div>
                <p className="question-text">{question.question}</p>

                <div className="question-options">
                  {question.options.map((option, optIdx) => (
                    <button
                      key={optIdx}
                      className={`question-option ${isOptionSelected(key, option.label, question.multiSelect || false) ? 'selected' : ''}`}
                      onClick={() => handleOptionClick(key, option.label, question.multiSelect || false)}
                    >
                      <span className="option-label">{option.label}</span>
                      {option.description && (
                        <span className="option-description">{option.description}</span>
                      )}
                    </button>
                  ))}

                  {/* Other option with text input */}
                  <div className="question-option-other">
                    <input
                      type="text"
                      className="other-input"
                      placeholder={t('askUserQuestion.otherPlaceholder')}
                      value={otherInputs[key] || ''}
                      onChange={(e) => handleOtherInputChange(key, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="ask-user-question-actions">
          <button
            className="action-btn cancel-btn"
            onClick={handleCancel}
          >
            {t('askUserQuestion.cancel')}
          </button>
          <button
            className="action-btn submit-btn"
            onClick={handleSubmit}
            disabled={!hasValidAnswer()}
          >
            {t('askUserQuestion.submit')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AskUserQuestionDialog;
