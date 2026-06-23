import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './AiAnalysisPanel.css';
import MonaiLabelClient from '../services/MonaiLabelClient';

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
    };
    this.serverURI = 'http://127.0.0.1:8000';
  }

  client = () => new MonaiLabelClient(this.serverURI);

  getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('teleoph.token');
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

  runAnalysis = async () => {
    const { uiNotificationService } = this.props.servicesManager.services;
    this.setState({ loading: true, error: null, report: null });

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
      this.setState({ loading: false, error: err.message || 'Analysis failed' });
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
    const { report } = this.state;
    
    if (!report) {
      this.setState({ reportError: 'No analysis results available. Run AI Analysis first.' });
      return;
    }

    this.setState({ generatingReport: true, reportError: null, reportResult: null });

    const viewportInfo = this.getActiveViewportInfo();
    const patientId = viewportInfo?.displaySet?.PatientID || viewportInfo?.displaySet?.PatientName || 'Unknown';

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
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          report_data: report,
          patient_id: patientId,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      this.setState({ reportResult: result, generatingReport: false });

      uiNotificationService.show({
        title: 'Report Generation',
        message: 'Medical report generated successfully',
        type: 'success',
        duration: 4000,
      });
    } catch (err) {
      console.error('Report generation error:', err);
      this.setState({ generatingReport: false, reportError: err.message || 'Report generation failed' });
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
            <div className="sectionTitle">DR Grade</div>
            <div className="row">
              <span className="label">Grade</span>
              <span className="gradeValue">{dr.grade}</span>
            </div>
            <div className="row">
              <span className="label">Confidence</span>
              <span className="value">{Math.round((dr.confidence || 0) * 100)}%</span>
            </div>
            {this.renderGradeBar(dr.confidence)}
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
                <span className="value">{lesions.coverage_pct.toFixed(1)}%</span>
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
              <span className="value">{opticDisc.cup_disc_ratio.toFixed(2)}</span>
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
      </div>
    );
  };

  render() {
    const { loading, error, report, generatingReport, reportResult, reportError } = this.state;

    return (
      <div className="aiAnalysisPanel">
        {!report && !loading && !error && (
          <div>
            <div className="noResults">
              Run AI analysis to generate a report with DR classification,
              lesion counts, cup/disc ratio, and vessel density.
            </div>
            <button
              className="analyzeButton"
              onClick={this.runAnalysis}
            >
              Run AI Analysis
            </button>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner" />
            Running AI analysis...<br />
            <small>Segmentation → Classification → Quantification</small>
          </div>
        )}

        {error && (
          <div>
            <div className="error">{error}</div>
            <button
              className="analyzeButton"
              onClick={this.runAnalysis}
            >
              Retry AI Analysis
            </button>
          </div>
        )}

        {report && (
          <div>
            {this.renderReport()}
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
              <div className="generatedReport" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #444' }}>
                <h3 style={{ color: '#fff', marginBottom: '12px' }}>Generated Medical Report</h3>
                <div 
                  className="reportContent"
                  style={{ 
                    background: '#1a1a1a', 
                    padding: '16px', 
                    borderRadius: '8px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    color: '#ddd',
                    lineHeight: '1.6'
                  }}
                  dangerouslySetInnerHTML={{ __html: reportResult.report_html }}
                />
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <button
                    className="analyzeButton"
                    onClick={() => this.setState({ reportResult: null })}
                  >
                    Close Report
                  </button>
                  <button
                    className="reportButton"
                    onClick={() => {
                      const printWindow = window.open('', '_blank');
                      printWindow.document.write(`
                        <html>
                          <head><title>Medical Report</title></head>
                          <body>${reportResult.report_html}</body>
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
