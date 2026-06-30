import { addTool } from '@cornerstonejs/tools';
import { Types } from '@ohif/core';
import { addIcon } from '@ohif/ui';
import ProbeMONAILabelTool from './tools/ProbeMONAILabelTool';

function AiAnalysisIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" />
      <path d="M18 15l1 3.5L22 19l-3.5 1-1 3.5-1-3.5L13 19l3.5-1z" />
    </svg>
  );
}

/**
 * @param {object} configuration
 */
export default function init({
  servicesManager,
  configuration = {},
}: Types.Extensions.ExtensionParams): void {
  addTool(ProbeMONAILabelTool);
  addIcon('tool-ai-analysis', AiAnalysisIcon);
}
