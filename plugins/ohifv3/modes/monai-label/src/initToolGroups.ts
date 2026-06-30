function createTools({ utilityModule, commandsManager }) {
  const { toolNames, Enums } = utilityModule.exports;

  const tools = {
    active: [
      { toolName: toolNames.WindowLevel, bindings: [{ mouseButton: Enums.MouseBindings.Primary }] },
      { toolName: toolNames.Pan, bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }] },
      {
        toolName: toolNames.Zoom,
        bindings: [{ mouseButton: Enums.MouseBindings.Secondary }, { numTouchPoints: 2 }],
      },
      {
        toolName: toolNames.StackScroll,
        bindings: [{ mouseButton: Enums.MouseBindings.Wheel }, { numTouchPoints: 3 }],
      },
    ],
    passive: [
      { toolName: toolNames.StackScroll },
      { toolName: toolNames.Magnify },
      { toolName: toolNames.WindowLevelRegion },
      { toolName: toolNames.UltrasoundDirectional },
      { toolName: 'ProbeMONAILabel' }
    ],
    disabled: [],
  };

  return tools;
}

function initDefaultToolGroup(extensionManager, toolGroupService, commandsManager, toolGroupId) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );
  const tools = createTools({ commandsManager, utilityModule });
  toolGroupService.createToolGroupAndAddTools(toolGroupId, tools);
}

function initToolGroups(extensionManager, toolGroupService, commandsManager) {
  // Fundus photography uses a 2D stack viewport. Initializing MPR and 3D
  // groups here adds synchronous startup work but those groups are never used.
  initDefaultToolGroup(extensionManager, toolGroupService, commandsManager, 'default');
}

export default initToolGroups;
