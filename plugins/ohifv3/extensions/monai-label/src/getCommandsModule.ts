export default function getCommandsModule({ servicesManager }) {
  const { uiNotificationService } = servicesManager.services;

  const actions = {
    setToolActive: ({ toolName }) => {
      uiNotificationService.show({
        title: 'MONAI Label probe',
        message: 'MONAI Label Probe Activated.',
        type: 'info',
        duration: 3000,
      });
    },
    runAiAnalysis: () => {
      const panelService = servicesManager.services.panelService;
      if (panelService) {
        panelService.activatePanel('@ohif/extension-monai-label.panelModule.aiAnalysis', true);
      } else {
        uiNotificationService.show({
          title: 'AI Analysis',
          message: 'AI Analysis panel is not available.',
          type: 'error',
          duration: 3000,
        });
      }
    },
  };

  const definitions = {
  };

  return {
    actions,
    definitions,
    defaultContext: 'MONAILabel',
  };
}
