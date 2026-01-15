import { useEffect, useState } from 'react';
import './AskUserQuestionDialog.css';

export interface QuestionOption {
  label: string;
  description: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface AskUserQuestionRequest {
  requestId: string;
  toolName: string;
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
  // Store answers for each question: question -> selectedLabel(s)
  const [answers, setAnswers] = useState<Record<string, Set<string>>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  useEffect(() => {
    if (isOpen && request) {
      // Initialize answer state
      const initialAnswers: Record<string, Set<string>> = {};
      request.questions.forEach((q) => {
        initialAnswers[q.question] = new Set<string>();
      });
      setAnswers(initialAnswers);
      setCurrentQuestionIndex(0);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  if (!isOpen || !request) {
    return null;
  }

  const currentQuestion = request.questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === request.questions.length - 1;
  const currentAnswerSet = answers[currentQuestion.question] || new Set<string>();

  const handleOptionToggle = (label: string) => {
    setAnswers((prev) => {
      const newAnswers = { ...prev };
      const currentSet = new Set(newAnswers[currentQuestion.question] || []);

      if (currentQuestion.multiSelect) {
        // Multi-select mode: toggle option
        if (currentSet.has(label)) {
          currentSet.delete(label);
        } else {
          currentSet.add(label);
        }
      } else {
        // Single-select mode: clear and set new option
        currentSet.clear();
        currentSet.add(label);
      }

      newAnswers[currentQuestion.question] = currentSet;
      return newAnswers;
    });
  };

  const handleNext = () => {
    if (isLastQuestion) {
      handleSubmitFinal();
    } else {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const handleSubmitFinal = () => {
    // Convert Set to comma-separated string (multi) or single string (single)
    const formattedAnswers: Record<string, string> = {};
    request.questions.forEach((q) => {
      const selectedSet = answers[q.question] || new Set<string>();
      if (selectedSet.size > 0) {
        formattedAnswers[q.question] = Array.from(selectedSet).join(', ');
      } else {
        formattedAnswers[q.question] = '';
      }
    });

    onSubmit(request.requestId, formattedAnswers);
  };

  const handleCancel = () => {
    onCancel(request.requestId);
  };

  const canProceed = currentAnswerSet.size > 0;

  return (
    <div className="permission-dialog-overlay">
      <div className="ask-user-question-dialog">
        {/* Title area */}
        <h3 className="ask-user-question-dialog-title">
          Claude has some questions for you
        </h3>
        <div className="ask-user-question-dialog-progress">
          Question {currentQuestionIndex + 1} / {request.questions.length}
        </div>

        {/* Question area */}
        <div className="ask-user-question-dialog-question">
          <div className="question-header">
            <span className="question-tag">{currentQuestion.header}</span>
          </div>
          <p className="question-text">{currentQuestion.question}</p>

          {/* Options list */}
          <div className="question-options">
            {currentQuestion.options.map((option, index) => {
              const isSelected = currentAnswerSet.has(option.label);
              return (
                <button
                  key={index}
                  className={`question-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleOptionToggle(option.label)}
                >
                  <div className="option-checkbox">
                    {currentQuestion.multiSelect ? (
                      <span className={`codicon codicon-${isSelected ? 'check' : 'blank'}`} />
                    ) : (
                      <span className={`codicon codicon-${isSelected ? 'circle-filled' : 'circle-outline'}`} />
                    )}
                  </div>
                  <div className="option-content">
                    <div className="option-label">{option.label}</div>
                    <div className="option-description">{option.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Hint text */}
          {currentQuestion.multiSelect && (
            <p className="question-hint">
              You can select multiple options
            </p>
          )}
        </div>

        {/* Button area */}
        <div className="ask-user-question-dialog-actions">
          <button
            className="action-button secondary"
            onClick={handleCancel}
          >
            Cancel
          </button>

          <div className="action-buttons-right">
            {currentQuestionIndex > 0 && (
              <button
                className="action-button secondary"
                onClick={handleBack}
              >
                Back
              </button>
            )}

            <button
              className={`action-button primary ${!canProceed ? 'disabled' : ''}`}
              onClick={handleNext}
              disabled={!canProceed}
            >
              {isLastQuestion ? 'Submit' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AskUserQuestionDialog;
