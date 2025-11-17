import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Waypoint, Activity, ActivityTemplate } from '../types';
import { ChevronUp, ChevronDown, Trash2, Plus, Save, FolderOpen } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface ActivityTimelineModalProps {
  isOpen: boolean;
  waypoint: Waypoint;
  onClose: () => void;
  onSave: (updates: Partial<Waypoint>) => void;
}

const TEMPLATES_STORAGE_KEY = 'lunagis_activity_templates';

// Helper functions for template management
const loadTemplates = (): ActivityTemplate[] => {
  try {
    const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading templates:', error);
    return [];
  }
};

const saveTemplates = (templates: ActivityTemplate[]) => {
  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    console.error('Error saving templates:', error);
  }
};

export const ActivityTimelineModal: React.FC<ActivityTimelineModalProps> = ({
  isOpen,
  waypoint,
  onClose,
  onSave,
}) => {
  const { activityDefinitions } = useAppContext();
  const [activities, setActivities] = useState<Activity[]>(waypoint.activities || []);
  const [isAddDropdownOpen, setIsAddDropdownOpen] = useState(false);
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
  const [templates, setTemplates] = useState<ActivityTemplate[]>(loadTemplates());
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showLoadConfirmation, setShowLoadConfirmation] = useState(false);
  const [templateToLoad, setTemplateToLoad] = useState<ActivityTemplate | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const addDropdownRef = useRef<HTMLDivElement>(null);
  const templateDropdownRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Track unsaved changes
  useEffect(() => {
    const originalActivities = waypoint.activities || [];
    const changed = JSON.stringify(activities) !== JSON.stringify(originalActivities);
    setHasUnsavedChanges(changed);
  }, [activities, waypoint.activities]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addDropdownRef.current && !addDropdownRef.current.contains(event.target as Node)) {
        setIsAddDropdownOpen(false);
      }
      if (templateDropdownRef.current && !templateDropdownRef.current.contains(event.target as Node)) {
        setIsTemplateDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  const generateId = () => `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Wrap in useCallback to ensure we always use the latest activityDefinitions
  const handleAddActivity = useCallback((type: string) => {
    const definition = activityDefinitions.find(def => def.id === type);
    const newActivity: Activity = {
      id: generateId(),
      type,
      duration: definition?.defaultDuration || 60,
    };
    setActivities(prev => [...prev, newActivity]);
    setIsAddDropdownOpen(false);
  }, [activityDefinitions]);

  const handleRemoveActivity = (id: string) => {
    setActivities(activities.filter(a => a.id !== id));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newActivities = [...activities];
    [newActivities[index - 1], newActivities[index]] = [newActivities[index], newActivities[index - 1]];
    setActivities(newActivities);
  };

  const handleMoveDown = (index: number) => {
    if (index === activities.length - 1) return;
    const newActivities = [...activities];
    [newActivities[index], newActivities[index + 1]] = [newActivities[index + 1], newActivities[index]];
    setActivities(newActivities);
  };

  const handleDurationChange = (id: string, value: string) => {
    const numValue = parseInt(value);
    if (value === '' || (!isNaN(numValue) && numValue >= 0)) {
      setActivities(activities.map(a =>
        a.id === id ? { ...a, duration: value === '' ? 0 : numValue } : a
      ));
    }
  };

  const handleTypeChange = (id: string, type: string) => {
    setActivities(activities.map(a =>
      a.id === id ? { ...a, type } : a
    ));
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    const newTemplate: ActivityTemplate = {
      id: generateId(),
      name: templateName.trim(),
      activities: activities.map(a => ({ ...a, id: generateId() })), // Clone with new IDs
    };

    const updatedTemplates = [...templates, newTemplate];
    setTemplates(updatedTemplates);
    saveTemplates(updatedTemplates);
    setShowSaveTemplateDialog(false);
    setTemplateName('');
  };

  const handleLoadTemplate = (template: ActivityTemplate) => {
    if (hasUnsavedChanges && activities.length > 0) {
      setTemplateToLoad(template);
      setShowLoadConfirmation(true);
      setIsTemplateDropdownOpen(false);
    } else {
      confirmLoadTemplate(template);
    }
  };

  const confirmLoadTemplate = (template: ActivityTemplate) => {
    // Clone activities with new IDs
    const clonedActivities = template.activities.map(a => ({
      ...a,
      id: generateId(),
    }));
    setActivities(clonedActivities);
    setShowLoadConfirmation(false);
    setTemplateToLoad(null);
    setIsTemplateDropdownOpen(false);
  };

  const handleDeleteTemplate = (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this template?')) {
      const updatedTemplates = templates.filter(t => t.id !== templateId);
      setTemplates(updatedTemplates);
      saveTemplates(updatedTemplates);
    }
  };

  const handleSave = () => {
    // Validate all durations are non-negative integers
    const hasInvalidDuration = activities.some(a => a.duration < 0 || !Number.isInteger(a.duration));
    if (hasInvalidDuration) {
      alert('All activity durations must be non-negative integers');
      return;
    }

    onSave({
      activities: activities.length > 0 ? activities : undefined,
    });
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getTotalDuration = () => {
    return activities.reduce((sum, a) => sum + a.duration, 0);
  };

  // Prevent all events from propagating to the canvas behind the modal
  const stopEventPropagation = (e: React.UIEvent) => {
    e.stopPropagation();
  };

  // Only prevent zoom on the backdrop, not inside the modal where we want scrolling
  const handleBackdropWheel = (e: React.WheelEvent) => {
    // Only stop propagation if the wheel event is on the backdrop itself
    if (e.target === e.currentTarget) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  // Stop wheel event propagation from modal content (but allow scrolling)
  const handleModalWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
  };

  const preventKeyboardPropagation = (e: React.KeyboardEvent) => {
    e.stopPropagation();
  };

  return (
    <>
      <div
        data-modal="true"
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        onClick={handleBackdropClick}
        onWheel={handleBackdropWheel}
        onKeyDown={preventKeyboardPropagation}
        onKeyUp={preventKeyboardPropagation}
        onMouseDown={stopEventPropagation}
        onMouseUp={stopEventPropagation}
        onMouseMove={stopEventPropagation}
      >
        <div
          ref={modalRef}
          className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl flex flex-col border border-gray-700"
          style={{ height: '85vh' }}
          onWheel={handleModalWheel}
          onKeyDown={preventKeyboardPropagation}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-white">Activity Timeline Editor</h2>
              <p className="text-xs text-gray-400 mt-0.5">Waypoint: {waypoint.label}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              title="Close"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {/* Template Actions */}
            <div className="flex gap-2">
              <div className="relative flex-1" ref={templateDropdownRef}>
                <button
                  onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white rounded px-3 py-1.5 text-sm border border-gray-600 transition-colors flex items-center justify-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  Load Template
                </button>

                {isTemplateDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {templates.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">
                        No templates saved
                      </div>
                    ) : (
                      templates.map((template) => (
                        <div
                          key={template.id}
                          className="px-3 py-2 hover:bg-gray-600 transition-colors flex items-center justify-between group"
                        >
                          <button
                            onClick={() => handleLoadTemplate(template)}
                            className="flex-1 text-left text-sm text-gray-300"
                          >
                            <div className="font-medium">{template.name}</div>
                            <div className="text-xs text-gray-500">
                              {template.activities.length} activities
                            </div>
                          </button>
                          <button
                            onClick={(e) => handleDeleteTemplate(template.id, e)}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity p-1"
                            title="Delete template"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowSaveTemplateDialog(true)}
                disabled={activities.length === 0}
                className="bg-gray-700 hover:bg-gray-600 text-white rounded px-3 py-1.5 text-sm border border-gray-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                title={activities.length === 0 ? "Add activities before saving template" : "Save as template"}
              >
                <Save className="w-4 h-4" />
                Save as Template
              </button>
            </div>

            {/* Activities List Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-300">Activity Plan</h3>
              {activities.length > 0 && (
                <span className="text-xs text-gray-400">
                  Total: {getTotalDuration()}s ({activities.length} activities)
                </span>
              )}
            </div>

            {/* Activities Table */}
            <div className="space-y-1.5">
              {activities.map((activity, index) => (
                <div
                  key={activity.id}
                  className="bg-gray-700 rounded border border-gray-600 px-2.5 py-1.5 flex items-center gap-2"
                >
                  {/* Order Number */}
                  <div className="flex-shrink-0 w-6 h-6 bg-gray-800 rounded flex items-center justify-center text-xs font-medium text-gray-300">
                    {index + 1}
                  </div>

                  {/* Activity Type Dropdown */}
                  <select
                    value={activity.type}
                    onChange={(e) => handleTypeChange(activity.id, e.target.value)}
                    className="flex-1 bg-gray-800 text-white rounded px-2 py-1 border border-gray-600 focus:outline-none focus:border-blue-500 text-xs"
                  >
                    {activityDefinitions.map(def => (
                      <option key={def.id} value={def.id}>{def.name}</option>
                    ))}
                  </select>

                  {/* Duration Input */}
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={activity.duration}
                      onChange={(e) => handleDurationChange(activity.id, e.target.value)}
                      className="w-16 bg-gray-800 text-white rounded px-2 py-1 border border-gray-600 focus:outline-none focus:border-blue-500 text-xs text-right"
                      placeholder="Dur"
                    />
                    <span className="text-xs text-gray-400 w-4">s</span>
                  </div>

                  {/* Reorder Buttons */}
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors p-0.5"
                      title="Move up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === activities.length - 1}
                      className="text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors p-0.5"
                      title="Move down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleRemoveActivity(activity.id)}
                    className="text-red-400 hover:text-red-300 transition-colors p-0.5"
                    title="Remove activity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Add Activity Row */}
              <div className="relative" ref={addDropdownRef}>
                <button
                  onClick={() => setIsAddDropdownOpen(!isAddDropdownOpen)}
                  className="w-full bg-gray-700/50 hover:bg-gray-700 border-2 border-dashed border-gray-600 hover:border-blue-500 text-gray-400 hover:text-blue-400 rounded px-2.5 py-1.5 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Activity
                </button>

                {isAddDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {activityDefinitions.map((def) => (
                      <button
                        key={def.id}
                        onClick={() => handleAddActivity(def.id)}
                        className="w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-600 transition-colors"
                      >
                        {def.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-700 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Save Template Dialog */}
      {showSaveTemplateDialog && (
        <div
          data-modal="true"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
          onWheel={handleBackdropWheel}
          onKeyDown={preventKeyboardPropagation}
        >
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full border border-gray-700">
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Save Activity Template</h3>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Enter template name"
                className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') handleSaveTemplate();
                  if (e.key === 'Escape') setShowSaveTemplateDialog(false);
                }}
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowSaveTemplateDialog(false);
                    setTemplateName('');
                  }}
                  className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTemplate}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Load Template Confirmation Dialog */}
      {showLoadConfirmation && templateToLoad && (
        <div
          data-modal="true"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
          onWheel={handleBackdropWheel}
          onKeyDown={preventKeyboardPropagation}
        >
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full border border-gray-700">
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Unsaved Changes</h3>
              <p className="text-gray-300 text-sm">
                You have unsaved changes to the current activity plan. Loading a template will replace all current activities. Do you want to continue?
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowLoadConfirmation(false);
                    setTemplateToLoad(null);
                  }}
                  className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmLoadTemplate(templateToLoad)}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
