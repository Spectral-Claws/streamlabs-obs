import { createAlertsMap, IWidgetState, useWidget, WidgetModule } from '../useWidget';
import { values } from 'lodash';
import { IAlertInfo, TAlertType } from '../../../services/widgets/widget-settings';
import { createBinding } from '../../shared/inputs';
import { Services } from '../../service-provider';
import { mutation } from '../../store';
import { metadata } from '../../shared/inputs/metadata';
import { $t } from '../../../services/i18n';

interface IAlertBoxState extends IWidgetState {
  data: {
    settings: {
      alert_delay: 0;
    };
  };
  variations: TVariationsState;
}

/**
 * A Redux module for AlertBox components
 */
export class AlertBoxModule extends WidgetModule<IAlertBoxState> {
  /**
   * list of all events supported by users' platforms
   */
  alertEvents = values(this.eventsInfo) as IAlertInfo[];

  /**
   * metadata for the general settings form
   */
  private generalMetadata = getGeneralSettingsMetadata();

  /**
   * metadata for the variation settings form
   */
  private variationsMetadata = getVariationsMetadata();

  /**
   * returns settings for a given variation from the state
   */
  getVariationSettings<T extends TAlertType>(alertType: T, variationId = 'default') {
    return this.state.variations[alertType][variationId];
  }

  /**
   * 2-way bindings for general settings inputs
   */
  bind = createBinding(
    // define source of values
    () => this.settings,
    // define onChange handler
    statePatch => this.updateSettings(statePatch),
  );

  /**
   * 2-way bindings for variation settings inputs
   */
  createVariationBinding(alertType: TAlertType, variationId = 'default') {
    return createBinding(
      // define source of values
      () => this.getVariationSettings(alertType, variationId),
      // define onChange handler
      newSettings => this.updateVariationSettings(alertType, variationId, newSettings),
      // pull additional metadata like tooltip, label, min, max, etc...
      fieldName => this.variationsMetadata[alertType as any][fieldName],
    );
  }

  /**
   * enable or disable an alert
   */
  setEnabled(type: TAlertType, enabled: boolean) {
    this.updateVariationSettings(type, 'default', { enabled });
  }

  /**
   * check alert is enabled
   */
  isEnabled(type: TAlertType) {
    return this.getVariationSettings(type).enabled;
  }

  /**
   * Switch UI to a legacy alertbox
   */
  public switchToLegacyAlertbox() {
    const { SourcesService, CustomizationService } = Services;
    CustomizationService.actions.setSettings({ legacyAlertbox: true });
    SourcesService.actions.showSourceProperties(this.state.sourceId);
  }

  /**
   * @override
   * Patch and sanitize the AlertBox settings after fetching data from the server
   */
  protected patchAfterFetch(data: any): any {
    const settings = data.settings;
    const alertEvents = this.alertEvents;

    // sanitize general settings
    Object.keys(settings).forEach(key => {
      settings[key] = this.sanitizeValue(settings[key], this.generalMetadata[key]);
    });

    // group alertbox settings by alert types and store them in `state.variations`
    alertEvents.map(alertEvent => {
      const apiKey = alertEvent.apiKey || alertEvent.type;
      const alertFields = Object.keys(settings).filter(key => key.startsWith(`${apiKey}_`));
      const variationSettings = {} as any;
      alertFields.forEach(key => {
        let value = settings[key];
        const targetKey = key.replace(`${apiKey}_`, '');

        // sanitize the variation value
        value = this.sanitizeValue(value, this.variationsMetadata[targetKey]);

        settings[key] = value;
        variationSettings[targetKey] = value;
      });
      this.setVariationSettings(alertEvent.type, 'default', variationSettings as any);
    });
    return data;
  }

  /**
   * The AlertBox backend saves some setting in a different format
   * Patch them before sending the request to the server
   */
  protected patchBeforeSend(settings: any): any {
    const keys = Object.keys(settings);
    const newSettings = { ...settings };
    keys.forEach(key => {
      if (['alert_delay', 'moderation_delay', 'text_delay'].includes(key)) {
        newSettings[key] = Math.floor(settings[key] / 1000);
      }
    });
    return newSettings;
  }

  sanitizeValue(value: any, fieldMetadata: Record<string, any>) {
    if (fieldMetadata) {
      // fix Min and Max values
      if (fieldMetadata.min !== undefined && value < fieldMetadata.min) {
        return fieldMetadata.min;
      }
      if (fieldMetadata.max !== undefined && value > fieldMetadata.max) {
        return fieldMetadata.max;
      }
    }
    return value;
  }

  /**
   * Update variation settings and sync them with the server
   */
  public updateVariationSettings(
    type: TAlertType,
    variationId: string,
    variationPatch: Partial<TVariationsSettings[TAlertType]>,
  ) {
    const event = this.eventsInfo[type];
    const apiKey = event.apiKey || event.type;
    const currentVariationSettings = this.state.variations[type].default;

    // save current settings to the state
    this.setVariationSettings(type, variationId, {
      ...currentVariationSettings,
      ...variationPatch,
    });

    // flatten settings by adding prefixes
    const settingsPatch = {} as any;
    Object.keys(variationPatch).forEach(key => {
      settingsPatch[`${apiKey}_${key}`] = variationPatch[key];
    });

    // save flatten setting in store and save them on the server
    this.updateSettings({ ...this.state.data.settings, ...settingsPatch });
  }

  /**
   * Save the variation settings in store
   */
  @mutation()
  private setVariationSettings(
    type: TAlertType,
    variationId: string,
    settings: TVariationsSettings[TAlertType],
  ) {
    const state = this.state;
    if (!state.variations) state.variations = {} as any;
    if (!state.variations[type]) state.variations[type] = {} as any;
    state.variations[type][variationId] = settings;
  }
}

/**
 * Hook for using the AlertBox module in components
 */
export function useAlertBox() {
  return useWidget<AlertBoxModule>();
}

/**
 * Returns metadata for the general settings form
 */
function getGeneralSettingsMetadata() {
  return {
    alert_delay: metadata.slider({
      label: $t('Global Alert Delay'),
      step: 1000,
      min: 0,
      max: 30000,
      tipFormatter: (ms: number) => `${ms / 1000}s`,
    }),
    interrupt_mode_delay: {
      min: 0,
      max: 20000,
    },
  };
}

/**
 * Returns metadata for the variation settings form
 */
function getVariationsMetadata() {
  // define common metadata for all variations
  const commonMetadata = {
    alert_duration: metadata.slider({
      label: $t('Alert Duration'),
      min: 0,
      max: 30,
      tooltip: $t('How many seconds to show this alert before hiding it'),
    }),
    image_href: metadata.text({ label: $t('Image') }),
    sound_href: metadata.text({ label: $t('Sound') }),
    sound_volume: metadata.slider({ label: $t('Sound Volume'), min: 0, max: 100 }),
    message_template: metadata.text({ label: $t('Message Template') }),
    text_delay: metadata.slider({ label: $t('Text Delay'), min: 0, max: 30 }),
    enabled: metadata.bool({}),
  };

  // define unique metadata for each variation
  const specificMetadata = createAlertsMap({
    donation: {
      message_template: metadata.text({
        label: $t('Message Template'),
        tooltip:
          $t('When a donation alert shows up, this will be the format of the message.') +
          '\n' +
          $t('Available Tokens: ') +
          ' {name} ' +
          $t('The name of the donator') +
          ' {amount} ' +
          $t('The amount that was donated'),
      }),

      alert_message_min_amount: metadata.number({
        label: $t('Min. Amount to Trigger Alert'),
        min: 0,
      }),
    },
    follow: {},
    raid: {},
    host: {},
    subscription: {},
    cheer: {},
    superchat: {},
    stars: {},
    support: {},
  });

  // mix common and specific metadata and return it
  Object.keys(specificMetadata).forEach(alertType => {
    specificMetadata[alertType] = { ...commonMetadata, ...specificMetadata[alertType] };
  });
  return specificMetadata as {
    [key in keyof typeof specificMetadata]: typeof specificMetadata[key] & typeof commonMetadata;
  };
}

// DEFINE HELPER TYPES

/**
 * A type for metadata object
 */
type TVariationsMetadata = ReturnType<typeof getVariationsMetadata>;

/**
 * A type for alert settings
 *
 * {
 *   donation: {
 *     alert_duration: number;
 *     image_href: string;
 *     ...
 *   },
 *   follow: {
 *     ...
 *   }
 *   ...
 * }
 *
 */
type TVariationsSettings = {
  [fieldName in keyof TVariationsMetadata]: PickValues<TVariationsMetadata[fieldName]>;
};

/**
 * A type for variation settings grouped by variations
 *
 * {
 *   donation: {
 *     default: {
 *       alert_duration: number;
 *       image_href: string;
 *       ...
 *     }
 *     default001: {
 *       ...
 *     }
 *   },
 *   ...
 * }
 *
 */
type TVariationsState = {
  [fieldName in keyof TVariationsSettings]: Record<string, TVariationsSettings[fieldName]>;
};

// helper utils
type PickValue<T> = T extends { value?: infer TValue } ? TValue : never;
type PickValues<T> = {
  [fieldName in keyof T]: PickValue<T[fieldName]>;
};

// type TVariationsSettings = {
//   [variationName in keyof TVariationMetadata]: TVariationSettings
// };

// const md = (null as unknown) as TVariationsMetadata;
// const settings = (null as unknown) as TVariationsSettings;
//
// function getVariationSettings<T extends TAlertType>(alertType: T) {
//   return settings[alertType];
// }
//
// function getVariationMetadata<T extends TAlertType>(alertType: T) {
//   return md[alertType];
// }
// const donationMetadata = getVariationMetadata('donation');
// const md_min_amount = donationMetadata.alert_message_min_amount;
// const md_commonProp = donationMetadata.testCommonProp;
//
// const donationSettings = getVariationSettings('donation');
// const alert_duration = donationSettings.alert_duration;
// const min_amount = donationSettings.alert_message_min_amount;
// const commonProp = donationSettings.testCommonProp;
