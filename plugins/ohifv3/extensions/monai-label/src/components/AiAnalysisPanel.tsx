import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './AiAnalysisPanel.css';
import MonaiLabelClient from '../services/MonaiLabelClient';

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const plainTextToHtml = (value) =>
  escapeHtml(value)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');

const sanitizeReportHtml = (value) => {
  if (!value) return '';
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(value);
  if (!looksLikeHtml || typeof DOMParser === 'undefined') {
    return plainTextToHtml(value);
  }

  const parsed = new DOMParser().parseFromString(value, 'text/html');
  parsed
    .querySelectorAll('script, style, iframe, object, embed')
    .forEach((node) => node.remove());
  parsed.body.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (
        attribute.name.toLowerCase().startsWith('on') ||
        ['srcdoc', 'formaction'].includes(attribute.name.toLowerCase())
      ) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return parsed.body.innerHTML;
};

export default class AiAnalysisPanel extends Component {
  static propTypes = {
    commandsManager: PropTypes.any,
    servicesManager: PropTypes.any,
    extensionManager: PropTypes.any,
  };

  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      error: null,
      report: null,
      generatingReport: false,
      reportResult: null,
      reportError: null,
      noteText: '',
      selectedEye: 'both',
      notes: [],
      savingNote: false,
      panelWidth: null,
      editableReportText: '',
      saving: false,
      reportId: null,
      saved: false,
    };
    this.serverURI = window.location.origin + '/monai/';
    this.reportRef = React.createRef();
    this.reportEditorRef = React.createRef();
    this.panelRef = React.createRef();
    this.savedReportLoadAttempts = 0;
    this.savedReportTimer = null;
  }

  componentDidMount() {
    this.loadSavedReport();
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.report && prevState.report !== this.state.report) {
      this.loadNotes();
    }
  }

  componentWillUnmount() {
    if (this.savedReportTimer) {
      window.clearTimeout(this.savedReportTimer);
    }
  }

  client = () => new MonaiLabelClient(this.serverURI);

  getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('teleoph.token') ||
        sessionStorage.getItem('teleoph.token')
      );
    }
    return null;
  };

  getActiveViewportInfo = () => {
    const { viewportGridService, displaySetService } =
      this.props.servicesManager.services;
    const { viewports, activeViewportId } = viewportGridService.getState();
    const viewport = viewports.get(activeViewportId);
    if (!viewport) return null;
    const displaySet = displaySetService.getDisplaySetByUID(
      viewport.displaySetInstanceUIDs[0]
    );
    return { viewport, displaySet };
  };

  loadSavedReport = async () => {
    const viewportInfo = this.getActiveViewportInfo();
    const studyUid = viewportInfo?.displaySet?.StudyInstanceUID;

    // The sidebar can mount just before OHIF finishes creating its viewport.
    if (!studyUid) {
      if (this.savedReportLoadAttempts < 10) {
        this.savedReportLoadAttempts += 1;
        this.savedReportTimer = window.setTimeout(this.loadSavedReport, 300);
      }
      return;
    }

    try {
      const token = this.getAuthToken();
      const response = await fetch(
        `/api/exams/medical-reports/?examination_id=${encodeURIComponent(studyUid)}&limit=1`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!response.ok) {
        return;
      }

      const reports = await response.json();
      const savedReport = Array.isArray(reports) ? reports[0] : null;
      if (!savedReport) {
        this.setState({
          report: null,
          reportResult: null,
          editableReportText: '',
          reportId: null,
          saved: false,
          notes: [],
        });
        return;
      }

      const savedContent =
        savedReport.final_content ||
        savedReport.doctor_content ||
        savedReport.ai_content ||
        '';

      this.setState({
        report: savedReport.ai_report_data || {},
        reportResult: { restored: true },
        editableReportText: sanitizeReportHtml(savedContent),
        reportId: savedReport.id,
        saved: true,
      });
    } catch (error) {
      console.error('Failed to restore saved medical report:', error);
    }
  };

  runAnalysis = async () => {
    const { uiNotificationService } = this.props.servicesManager.services;
    this.setState({
      loading: true,
      error: null,
      report: null,
      reportResult: null,
      reportError: null,
      editableReportText: '',
      reportId: null,
      saved: false,
      notes: [],
    });

    const viewportInfo = this.getActiveViewportInfo();
    if (!viewportInfo || !viewportInfo.displaySet) {
      this.setState({ loading: false, error: 'No active image' });
      return;
    }

    const imageUid = viewportInfo.displaySet.SeriesInstanceUID;
    const nid = uiNotificationService.show({
      title: 'AI Analysis',
      message: 'Running analysis pipeline...',
      type: 'info',
      duration: 60000,
    });

    try {
      const response = await this.client().analyze(imageUid);
      console.log('Analysis response:', response);

      if (response.status !== 200) {
        throw new Error(response.data?.detail || 'Analysis failed');
      }

      const report = response.data;
      this.setState({ report, loading: false });

      uiNotificationService.show({
        title: 'AI Analysis',
        message: 'Analysis complete',
        type: 'success',
        duration: 4000,
      });
    } catch (err) {
      console.error('Analysis error:', err);
      this.setState({
        loading: false,
        error: err.message || 'Analysis failed',
      });
      uiNotificationService.show({
        title: 'AI Analysis',
        message: err.message || 'Analysis failed',
        type: 'error',
        duration: 6000,
      });
    } finally {
      uiNotificationService.hide(nid);
    }
  };

  generateReport = async () => {
    const { uiNotificationService } = this.props.servicesManager.services;
    const { report, selectedEye, notes } = this.state;

    if (!report) {
      this.setState({
        reportError: 'No analysis results available. Run AI Analysis first.',
      });
      return;
    }

    this.setState({
      generatingReport: true,
      reportError: null,
      reportResult: null,
    });

    const viewportInfo = this.getActiveViewportInfo();
    const patientId =
      viewportInfo?.displaySet?.PatientID ||
      viewportInfo?.displaySet?.PatientName ||
      'Unknown';
    const seriesUid = viewportInfo?.displaySet?.SeriesInstanceUID;

    const eyeLabel =
      selectedEye === 'both'
        ? 'Bilatéral'
        : selectedEye === 'right'
          ? 'Œil droit (OD)'
          : selectedEye === 'left'
            ? 'Œil gauche (OG)'
            : 'Non spécifié';

    const nid = uiNotificationService.show({
      title: 'Report Generation',
      message: 'Generating medical report with AI...',
      type: 'info',
      duration: 120000,
    });

    try {
      const token = this.getAuthToken();
      const response = await fetch('/api/exams/generate-report/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          report_data: report,
          patient_id: patientId,
          series_uid: seriesUid,
          eye: eyeLabel,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      const notesHtml =
        notes.length > 0
          ? '<hr><h3>Notes du médecin</h3><ul>' +
            notes
              .map(
                (n) =>
                  `<li><strong>${n.eye === 'right' ? 'OD' : n.eye === 'left' ? 'OG' : 'OD/OG'} :</strong> ${escapeHtml(n.text)}</li>`
              )
              .join('') +
            '</ul>'
          : '';

      const fullText =
        sanitizeReportHtml(result.report_html || result.report_text || '') +
        notesHtml;

      this.setState(
        {
          reportResult: result,
          editableReportText: fullText,
          generatingReport: false,
          saved: false,
        },
        () => {
          if (this.reportRef.current) {
            this.reportRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            });
          }
        }
      );

      uiNotificationService.show({
        title: 'Report Generation',
        message: 'Medical report generated successfully',
        type: 'success',
        duration: 4000,
      });
    } catch (err) {
      console.error('Report generation error:', err);
      this.setState({
        generatingReport: false,
        reportError: err.message || 'Report generation failed',
      });
      uiNotificationService.show({
        title: 'Report Generation',
        message: err.message || 'Report generation failed',
        type: 'error',
        duration: 6000,
      });
    } finally {
      uiNotificationService.hide(nid);
    }
  };

  applyReportFormat = (command, value = null) => {
    if (this.reportEditorRef.current) {
      this.reportEditorRef.current.focus();
    }
    document.execCommand(command, false, value);
    this.syncReportEditor();
  };

  syncReportEditor = () => {
    const editor = this.reportEditorRef.current;
    if (editor) {
      this.setState({
        editableReportText: sanitizeReportHtml(editor.innerHTML),
        saved: false,
      });
    }
  };

  saveReport = async () => {
    const { editableReportText, reportId, report } = this.state;
    const { uiNotificationService } = this.props.servicesManager.services;
    const viewportInfo = this.getActiveViewportInfo();
    const seriesUid = viewportInfo?.displaySet?.SeriesInstanceUID;
    const studyUid = viewportInfo?.displaySet?.StudyInstanceUID;
    const patientId =
      viewportInfo?.displaySet?.PatientID ||
      viewportInfo?.displaySet?.PatientName ||
      'Unknown';

    if (!seriesUid || !studyUid) {
      uiNotificationService.show({
        title: 'Save Report',
        message: 'No study or series UID available',
        type: 'error',
        duration: 4000,
      });
      return;
    }

    this.setState({ saving: true, saved: false });

    try {
      const token = this.getAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      if (reportId) {
        const resp = await fetch(`/api/exams/medical-reports/${reportId}/`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            doctor_content: editableReportText,
            study_instance_uid: studyUid,
          }),
        });
        if (!resp.ok) throw new Error('Failed to update report');
      } else {
        const resp = await fetch('/api/exams/medical-reports/', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            patient_id: patientId,
            examination_id: studyUid,
            study_instance_uid: studyUid,
            ai_content: editableReportText,
            ai_report_data: report,
          }),
        });
        if (!resp.ok) throw new Error('Failed to create report');
        const data = await resp.json();
        this.setState({ reportId: data.id });
      }

      this.setState({ saving: false, saved: true });
      localStorage.setItem(
        'teleoph.exam-status-updated',
        JSON.stringify({
          studyInstanceUid: studyUid,
          status: 'Interprété',
          timestamp: Date.now(),
        })
      );

      uiNotificationService.show({
        title: 'Save Report',
        message: 'Report saved successfully',
        type: 'success',
        duration: 3000,
      });
    } catch (err) {
      console.error('Save report error:', err);
      this.setState({ saving: false });
      uiNotificationService.show({
        title: 'Save Report',
        message: err.message || 'Failed to save report',
        type: 'error',
        duration: 6000,
      });
    }
  };

  loadNotes = async () => {
    const viewportInfo = this.getActiveViewportInfo();
    if (!viewportInfo || !viewportInfo.displaySet) return;
    const studyUid = viewportInfo.displaySet.StudyInstanceUID;
    if (!studyUid) {
      this.setState({ notes: [] });
      return;
    }

    try {
      const token = this.getAuthToken();
      const resp = await fetch(
        `/api/exams/doctor-notes/?series_instance_uid=${encodeURIComponent(studyUid)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        this.setState({ notes: data });
      }
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
  };

  addNote = async () => {
    const { noteText, selectedEye } = this.state;
    if (!noteText.trim()) return;

    const viewportInfo = this.getActiveViewportInfo();
    if (!viewportInfo || !viewportInfo.displaySet) return;
    const studyUid = viewportInfo.displaySet.StudyInstanceUID;
    if (!studyUid) return;

    this.setState({ savingNote: true });
    try {
      const token = this.getAuthToken();
      const resp = await fetch('/api/exams/doctor-notes/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          // The API field keeps its historical name, but the study UID is
          // required here because imported series UIDs may be duplicated.
          series_instance_uid: studyUid,
          eye: selectedEye,
          text: noteText.trim(),
        }),
      });
      if (resp.ok) {
        const newNote = await resp.json();
        this.setState((prev) => ({
          notes: [...prev.notes, newNote],
          noteText: '',
          savingNote: false,
        }));
      } else {
        this.setState({ savingNote: false });
      }
    } catch (err) {
      console.error('Failed to save note:', err);
      this.setState({ savingNote: false });
    }
  };

  renderGradeBar = (confidence) => {
    const pct = Math.round((confidence || 0) * 100);
    return (
      <div className="confidenceBar">
        <div className="confidenceFill" style={{ width: pct + '%' }} />
      </div>
    );
  };

  renderReport = () => {
    const { report } = this.state;
    if (!report) return null;

    const dr = report.dr_classification || {};
    const lesions = report.lesions || {};
    const opticDisc = report.optic_disc_cup || {};
    const vessels = report.vessels || {};

    return (
      <div>
        <div className="reportTitle">AI ANALYSIS REPORT</div>

        {dr.grade && (
          <div className="section">
            <div className="sectionTitle">DR Classification</div>
            <div className="row">
              <span className="label">Predicted Grade</span>
              <span className="gradeValue" style={{ fontWeight: 'bold' }}>
                {dr.grade}
              </span>
            </div>
            <div className="probabilitiesList" style={{ marginTop: '8px' }}>
              {(dr.probabilities || []).map((p, i) => (
                <div
                  key={i}
                  className="probabilityRow"
                  style={{ marginBottom: '6px' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      marginBottom: '2px',
                    }}
                  >
                    <span>{p.label}</span>
                    <span>{Math.round(p.score * 100)}%</span>
                  </div>
                  <div
                    style={{
                      height: '8px',
                      background: '#2a2a2a',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: Math.round(p.score * 100) + '%',
                        height: '100%',
                        background:
                          p.score === dr.confidence ? '#4caf50' : '#555',
                        borderRadius: '4px',
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {lesions.microaneurysms !== undefined && (
          <div className="section">
            <div className="sectionTitle">Lesions</div>
            <div className="row">
              <span className="label">Microaneurysms</span>
              <span className="value">{lesions.microaneurysms}</span>
            </div>
            <div className="row">
              <span className="label">Hemorrhages</span>
              <span className="value">{lesions.hemorrhages}</span>
            </div>
            <div className="row">
              <span className="label">Exudates</span>
              <span className="value">{lesions.exudates}</span>
            </div>
            {lesions.coverage_pct !== undefined && (
              <div className="row">
                <span className="label">Coverage</span>
                <span className="value">
                  {lesions.coverage_pct.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        )}

        {opticDisc.cup_disc_ratio !== undefined && (
          <div className="section">
            <div className="sectionTitle">Optic Disc / Cup</div>
            <div className="row">
              <span className="label">Disc Area</span>
              <span className="value">{opticDisc.disc_area_px || '—'} px</span>
            </div>
            <div className="row">
              <span className="label">Cup Area</span>
              <span className="value">{opticDisc.cup_area_px || '—'} px</span>
            </div>
            <div className="row">
              <span className="label">Cup/Disc Ratio</span>
              <span className="value">
                {opticDisc.cup_disc_ratio.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {vessels.coverage_pct !== undefined && (
          <div className="section">
            <div className="sectionTitle">Vessels</div>
            <div className="row">
              <span className="label">Coverage</span>
              <span className="value">{vessels.coverage_pct.toFixed(1)}%</span>
            </div>
            {vessels.tortuosity !== undefined && (
              <div className="row">
                <span className="label">Tortuosity</span>
                <span className="value">{vessels.tortuosity.toFixed(3)}</span>
              </div>
            )}
          </div>
        )}

        {report.gradcam_image && (
          <div className="section">
            <div className="sectionTitle">Grad-CAM Visualization</div>
            <img
              src={`data:image/png;base64,${report.gradcam_image}`}
              alt="Grad-CAM"
              style={{ width: '100%', borderRadius: '6px', marginTop: '4px' }}
            />
          </div>
        )}

        {report.clahe_image && (
          <div className="section">
            <div className="sectionTitle">CLAHE Enhanced</div>
            <img
              src={`data:image/png;base64,${report.clahe_image}`}
              alt="CLAHE Enhanced"
              style={{ width: '100%', borderRadius: '6px', marginTop: '4px' }}
            />
          </div>
        )}
      </div>
    );
  };

  renderDoctorNotes = () => {
    const { noteText, selectedEye, notes, savingNote } = this.state;

    return (
      <div className="doctorNotesSection">
        <div className="sectionTitle">Note de médecin</div>

        <div className="eyeCheckboxes">
          <label className="eyeCheckboxLabel">
            <input
              type="checkbox"
              checked={selectedEye === 'right' || selectedEye === 'both'}
              onChange={() => {
                if (selectedEye === 'right')
                  this.setState({ selectedEye: 'both' });
                else if (selectedEye === 'both')
                  this.setState({ selectedEye: 'left' });
                else this.setState({ selectedEye: 'right' });
              }}
            />
            Œil droit
          </label>
          <label className="eyeCheckboxLabel">
            <input
              type="checkbox"
              checked={selectedEye === 'left' || selectedEye === 'both'}
              onChange={() => {
                if (selectedEye === 'left')
                  this.setState({ selectedEye: 'both' });
                else if (selectedEye === 'both')
                  this.setState({ selectedEye: 'right' });
                else this.setState({ selectedEye: 'left' });
              }}
            />
            Œil gauche
          </label>
        </div>

        <div className="noteInputRow">
          <textarea
            className="noteTextarea"
            placeholder="Écrire une note..."
            value={noteText}
            onChange={(e) => this.setState({ noteText: e.target.value })}
            rows={3}
          />
          <button
            className="addNoteButton"
            onClick={this.addNote}
            disabled={savingNote || !noteText.trim()}
          >
            {savingNote ? '...' : 'Ajouter'}
          </button>
        </div>

        {notes.length > 0 && (
          <div className="notesList">
            {notes.map((note, idx) => (
              <div key={note.id || idx} className="noteItem">
                <div className="noteMeta">
                  <span className="noteEye">
                    {note.eye === 'right'
                      ? 'Œil droit'
                      : note.eye === 'left'
                        ? 'Œil gauche'
                        : 'Les deux'}
                  </span>
                  {note.user_name && (
                    <span className="noteAuthor">{note.user_name}</span>
                  )}
                  {note.created_at && (
                    <span className="noteDate">
                      {new Date(note.created_at).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
                <div className="noteText">{note.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = this.panelRef.current?.offsetWidth || 400;

    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = startWidth + (startX - ev.clientX);
      const maxWidth = Math.min(1000, window.innerWidth * 0.85);
      this.setState({
        panelWidth: Math.max(300, Math.min(maxWidth, newWidth)),
      });
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  render() {
    const {
      loading,
      error,
      report,
      generatingReport,
      reportResult,
      reportError,
      panelWidth,
    } = this.state;

    return (
      <div
        className="aiAnalysisPanel"
        ref={this.panelRef}
        style={panelWidth ? { width: panelWidth } : undefined}
      >
        <div className="resizeHandle" onMouseDown={this.handleMouseDown} />
        {!report && !loading && !error && (
          <div>
            <div className="noResults">
              Run AI analysis to generate a report with DR classification,
              lesion counts, cup/disc ratio, and vessel density.
            </div>
            <button className="analyzeButton" onClick={this.runAnalysis}>
              Run AI Analysis
            </button>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner" />
            Running AI analysis...
            <br />
            <small>Segmentation → Classification → Quantification</small>
          </div>
        )}

        {error && (
          <div>
            <div className="error">{error}</div>
            <button className="analyzeButton" onClick={this.runAnalysis}>
              Retry AI Analysis
            </button>
          </div>
        )}

        {report && (
          <div>
            {this.renderReport()}
            {this.renderDoctorNotes()}
            <div className="reportActions">
              <button
                className="analyzeButton"
                onClick={this.runAnalysis}
                style={{ marginRight: '8px' }}
              >
                Run Analysis Again
              </button>
              <button
                className="reportButton"
                onClick={this.generateReport}
                disabled={generatingReport}
              >
                {generatingReport ? 'Generating Report...' : 'Generate Report'}
              </button>
            </div>

            {reportError && (
              <div className="error" style={{ marginTop: '16px' }}>
                {reportError}
              </div>
            )}

            {reportResult && (
              <div
                className="generatedReport"
                ref={this.reportRef}
                style={{
                  marginTop: '24px',
                  paddingTop: '16px',
                  borderTop: '1px solid #444',
                }}
              >
                <h3 style={{ color: '#fff', marginBottom: '12px' }}>
                  Generated Medical Report
                </h3>
                <div className="reportEditor">
                  <div
                    className="reportEditorToolbar"
                    role="toolbar"
                    aria-label="Mise en forme du rapport"
                  >
                    <select
                      aria-label="Style du texte"
                      defaultValue="p"
                      onChange={(e) =>
                        this.applyReportFormat('formatBlock', e.target.value)
                      }
                    >
                      <option value="p">Paragraphe</option>
                      <option value="h2">Titre</option>
                      <option value="h3">Sous-titre</option>
                      <option value="blockquote">Citation</option>
                    </select>
                    {[
                      ['bold', 'B', 'Gras'],
                      ['italic', 'I', 'Italique'],
                      ['underline', 'U', 'Souligné'],
                      ['strikeThrough', 'S', 'Barré'],
                      ['insertOrderedList', '1.', 'Liste numérotée'],
                      ['insertUnorderedList', '•', 'Liste à puces'],
                      ['justifyLeft', '≡', 'Aligner à gauche'],
                      ['justifyCenter', '≣', 'Centrer'],
                      ['justifyRight', '☰', 'Aligner à droite'],
                      ['outdent', '←', 'Diminuer le retrait'],
                      ['indent', '→', 'Augmenter le retrait'],
                      ['removeFormat', 'Tx', 'Effacer le format'],
                      ['undo', '↶', 'Annuler'],
                      ['redo', '↷', 'Rétablir'],
                    ].map(([command, text, title]) => (
                      <button
                        key={command}
                        type="button"
                        title={title}
                        aria-label={title}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => this.applyReportFormat(command)}
                      >
                        {text}
                      </button>
                    ))}
                    <label title="Couleur du texte">
                      A
                      <input
                        type="color"
                        defaultValue="#dddddd"
                        aria-label="Couleur du texte"
                        onChange={(e) =>
                          this.applyReportFormat('foreColor', e.target.value)
                        }
                      />
                    </label>
                  </div>
                  <div
                    key={`${this.state.reportId || 'new'}-${this.state.reportResult?.restored ? 'restored' : 'generated'}`}
                    ref={this.reportEditorRef}
                    className="reportEditorContent"
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-multiline="true"
                    aria-label="Contenu du rapport médical"
                    onInput={this.syncReportEditor}
                    dangerouslySetInnerHTML={{
                      __html: this.state.editableReportText,
                    }}
                  />
                  <div className="reportEditorHint">
                    Rapport modifiable — vérifiez le contenu clinique avant
                    validation.
                  </div>
                </div>
                {this.state.saved && (
                  <div
                    style={{
                      color: '#4caf50',
                      fontSize: '12px',
                      marginTop: '4px',
                    }}
                  >
                    ✓ Rapport enregistré
                  </div>
                )}
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <button
                    className="reportButton"
                    onClick={this.saveReport}
                    disabled={
                      this.state.saving || !this.state.editableReportText.trim()
                    }
                  >
                    {this.state.saving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                  <button
                    className="analyzeButton"
                    onClick={() => {
                      const printWindow = window.open('', '_blank');
                      printWindow.document.write(`
                        <html>
                          <head><title>Medical Report</title></head>
                          <body>${sanitizeReportHtml(this.state.editableReportText)}</body>
                        </html>
                      `);
                      printWindow.document.close();
                      printWindow.print();
                    }}
                  >
                    Print Report
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}
