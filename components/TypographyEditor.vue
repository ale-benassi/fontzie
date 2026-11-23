<script setup lang="ts">
import Disclosure from "@/components/Disclosure.vue";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { computed, ref } from "vue";
import type {
  Rule,
  FontFamily,
  Property,
  Properties,
  Inspection,
} from "../core/schema";
import {
  availableAxes,
  availableWeights,
  fontVariantPatch,
  formatAxes,
  parseAxes,
  withoutAxis,
} from "../core/fonts";
import {
  binaryItalicAxis,
  supportsTypographyChange,
  type TypographyChange,
} from "../core/bulk-typography";
import ValueSlider from "./ValueSlider.vue";
import NumberField from "./NumberField.vue";
import VariableAxisIcon from "./VariableAxisIcon.vue";
import IconChoice from "./IconChoice.vue";
import Icon from "./Icon.vue";
const props = defineProps<{
  generation: number;
  rule?: Rule;
  font?: FontFamily;
  selection?: Inspection;
  bulkRules?: Rule[];
  bulkFonts?: (FontFamily | undefined)[];
  disabled: boolean;
  inactive?: boolean;
  blocked?: boolean;
  openOnActivate?: boolean;
}>();
const emit = defineEmits<{
  change: [patch: Partial<Record<Property, string | undefined>>];
  bulkChange: [change: TypographyChange];
}>();
const advancedOpen = ref(false);
const bulkProperties = computed(() =>
  props.bulkRules?.map((rule) => rule.properties),
);
const bulkAxes = computed(() =>
  bulkProperties.value?.map((properties) =>
    parseAxes(properties["font-variation-settings"]),
  ),
);
const axes = computed(() => {
  const font = props.font;
  if (!font) return [];
  if (!bulkProperties.value)
    return availableAxes(font, style.value, +value("font-weight", "400"));
  const [first, ...rest] = bulkProperties.value.map((properties) =>
    availableAxes(
      font,
      properties["font-style"] ?? "normal",
      Number(properties["font-weight"] ?? 400),
    ),
  );
  return (first ?? []).flatMap((axis) => {
    let { min, max } = axis;
    for (const axes of rest) {
      const other = axes.find(({ tag }) => tag === axis.tag);
      if (!other) return [];
      min = Math.max(min, other.min);
      max = Math.min(max, other.max);
    }
    return min < max ? [{ ...axis, min, max }] : [];
  });
});
const extraAxes = computed(() =>
  axes.value.filter((axis) => !["wght", "wdth", "ital"].includes(axis.tag)),
);
const italicAxis = computed(() =>
  axes.value.find(
    (axis) => axis.tag === "ital" && axis.min === 0 && axis.max === 1,
  ),
);
const hasStyleFaces = computed(
  () =>
    props.font?.styles.includes("normal") &&
    props.font.styles.includes("italic"),
);
const useItalicAxis = computed(
  () => !!italicAxis.value && !hasStyleFaces.value,
);
const axisNames: Record<string, string> = {
  opsz: "Optical size",
  slnt: "Slant",
  GRAD: "Grade",
};
const advancedFields = computed(() =>
  fields.filter((field) => {
    if (field.property === "font-optical-sizing")
      return !props.font || axes.value.some((axis) => axis.tag === "opsz");
    return true;
  }),
);
function bulkValue(p: Property, index: number) {
  const properties = bulkProperties.value?.[index];
  const weight = bulkAxes.value?.[index]?.get("wght");
  if (p === "font-weight" && weight !== undefined) return String(weight);
  if (p === "font-style" && properties) {
    const axis = binaryItalicAxis(props.bulkFonts?.[index], properties);
    if (axis)
      return (bulkAxes.value?.[index]?.get("ital") ?? axis.default) >= 0.5
        ? "italic"
        : "normal";
  }
  return properties?.[p];
}
function value(p: Property, fallback: string) {
  if (bulkProperties.value) return bulkValue(p, 0) ?? fallback;
  return props.rule?.properties[p] ?? props.selection?.computed[p] ?? fallback;
}
function fieldStatus(p: Property) {
  if (!bulkProperties.value?.length) return;
  const first = bulkValue(p, 0);
  if (bulkProperties.value.some((_, index) => bulkValue(p, index) !== first))
    return "Mixed";
  if (first === undefined) return "Original";
}
const overridden = (p: Property) =>
  bulkProperties.value
    ? bulkProperties.value.some((properties) => properties[p] !== undefined) ||
      (p === "font-weight" && hasAxisOverride("wght"))
    : props.rule?.properties[p] !== undefined;
const axisOverrides = computed(() =>
  parseAxes(props.rule?.properties["font-variation-settings"]),
);
function hasAxisOverride(tag: string) {
  return bulkAxes.value
    ? bulkAxes.value.some((axes) => axes.has(tag))
    : axisOverrides.value.has(tag);
}
function axisStatus(tag: string, fallback: number) {
  const axisValue = (axes: ReadonlyMap<string, number>, index: number) =>
    axes.get(tag) ??
    (tag === "wdth"
      ? parseFloat(bulkValue("font-stretch", index) ?? String(fallback))
      : fallback);
  const first = bulkAxes.value?.[0];
  if (
    first &&
    bulkAxes.value?.some(
      (axes, index) => axisValue(axes, index) !== axisValue(first, 0),
    )
  )
    return "Mixed";
}
function change(p: Property, v: string | undefined) {
  if (bulkProperties.value) {
    if (p === "font-stretch" && widthAxis.value)
      emit("bulkChange", {
        axis: "wdth",
        value: v === undefined ? undefined : parseFloat(v),
      });
    else emit("bulkChange", { property: p, value: v });
    return;
  }
  if (p === "font-style" && useItalicAxis.value) {
    if (v === undefined) resetAxis("ital");
    else updateAxis("ital", v === "italic" ? 1 : 0);
    return;
  }
  const patch: Partial<Record<Property, string | undefined>> = { [p]: v };
  if (props.font && (p === "font-style" || p === "font-weight")) {
    Object.assign(
      patch,
      fontVariantPatch(
        props.font,
        {
          "font-style": value(
            "font-style",
            "normal",
          ) as Properties["font-style"],
          "font-weight": value("font-weight", "400"),
          ...props.rule?.properties,
        },
        p === "font-style" ? { style: v ?? "normal" } : { weight: +(v ?? 400) },
      ),
    );
    if (v === undefined) {
      if (patch[p] === (p === "font-style" ? "normal" : "400"))
        patch[p] = undefined;
      patch["font-variation-settings"] = withoutAxis(
        patch["font-variation-settings"],
        p === "font-weight" ? "wght" : "ital",
      );
    }
    emit("change", patch);
    return;
  }
  if (p === "font-stretch" && v && axes.value.some((a) => a.tag === "wdth")) {
    updateAxis("wdth", parseFloat(v));
    return;
  }
  if (
    ((p === "font-weight" || p === "font-stretch") && v === undefined) ||
    (p === "font-optical-sizing" && v === "auto")
  ) {
    const tag =
      p === "font-weight" ? "wght" : p === "font-stretch" ? "wdth" : "opsz";
    patch["font-variation-settings"] = withoutAxis(
      props.rule?.properties["font-variation-settings"],
      tag,
    );
  }
  emit("change", patch);
}
const style = computed(() => value("font-style", "normal"));
const italicStyle = computed(() => {
  if (!useItalicAxis.value) return style.value;
  return axisValue("ital", italicAxis.value?.default ?? 0) >= 0.5
    ? "italic"
    : "normal";
});
const weights = computed(() =>
  props.font
    ? availableWeights(props.font, style.value)
    : [100, 200, 300, 400, 500, 600, 700, 800, 900],
);
const weightAxis = computed(() => axes.value.find((a) => a.tag === "wght"));
const widthAxis = computed(() =>
  axes.value.find((axis) => axis.tag === "wdth"),
);
const weightChoices = computed(() => {
  const axis = weightAxis.value;
  const choices = new Set(weights.value);
  if (axis) {
    choices.add(axis.min);
    choices.add(axis.max);
    for (let weight = 100; weight <= 1000; weight += 100)
      if (weight >= axis.min && weight <= axis.max) choices.add(weight);
  }
  props.bulkFonts?.forEach((font, index) => {
    if (font) {
      for (const weight of availableWeights(
        font,
        bulkValue("font-style", index) ?? "normal",
      ))
        choices.add(weight);
    }
  });
  return [...choices]
    .filter((weight) =>
      supportsBulkChange({ property: "font-weight", value: String(weight) }),
    )
    .sort((a, b) => a - b);
});
function supportsBulkChange(change: TypographyChange) {
  return (
    props.bulkRules?.every((rule, index) =>
      supportsTypographyChange(rule, change, props.bulkFonts?.[index]),
    ) ?? true
  );
}
const customWeight = computed(() =>
  (weightAxis.value || bulkProperties.value) &&
  !weightChoices.value.includes(+value("font-weight", "400"))
    ? value("font-weight", "400")
    : undefined,
);
const weightNames: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};
function updateAxis(tag: string, n: number) {
  const axis = axes.value.find((a) => a.tag === tag);
  if (!axis || !Number.isFinite(n) || n < axis.min || n > axis.max) return;
  if (bulkProperties.value) {
    emit("bulkChange", { axis: tag, value: n });
    return;
  }
  const map = new Map(axisOverrides.value);
  map.set(tag, n);
  const patch: Partial<Properties> = {
    "font-variation-settings": formatAxes(map),
  };
  if (tag === "wdth") patch["font-stretch"] = n + "%";
  if (tag === "opsz") patch["font-optical-sizing"] = "none";
  emit("change", patch);
}
function resetAxis(tag: string) {
  if (bulkProperties.value) {
    emit("bulkChange", { axis: tag, value: undefined });
    return;
  }
  const patch: Partial<Properties> = {
    "font-variation-settings": withoutAxis(
      props.rule?.properties["font-variation-settings"],
      tag,
    ),
  };
  if (tag === "opsz") patch["font-optical-sizing"] = undefined;
  emit("change", patch);
}
function axisValue(tag: string, def: number) {
  if (bulkAxes.value) return bulkAxes.value[0]?.get(tag) ?? def;
  return parseAxes(value("font-variation-settings", "")).get(tag) ?? def;
}
function weightChange(n: string) {
  change("font-weight", n);
}
const fields = [
  {
    property: "font-style",
    label: "Style",
    options: [
      { value: "normal", label: "Normal", icon: "style-normal" },
      { value: "italic", label: "Italic", icon: "style-italic" },
    ],
  },
  {
    property: "text-transform",
    label: "Transform",
    options: [
      { value: "none", label: "None", icon: "transform-none" },
      { value: "uppercase", label: "Uppercase", icon: "uppercase" },
      { value: "lowercase", label: "Lowercase", icon: "lowercase" },
      { value: "capitalize", label: "Capitalize", icon: "capitalize" },
    ],
  },
  {
    property: "text-decoration",
    label: "Decoration",
    options: [
      { value: "none", label: "None", icon: "decoration-none" },
      { value: "underline", label: "Underline", icon: "underline" },
      { value: "overline", label: "Overline", icon: "overline" },
      { value: "line-through", label: "Strikethrough", icon: "strikethrough" },
    ],
  },
  {
    property: "text-align",
    label: "Alignment",
    options: [
      { value: "start", label: "Start", icon: "align-start" },
      { value: "left", label: "Left", icon: "align-left" },
      { value: "center", label: "Center", icon: "align-center" },
      { value: "right", label: "Right", icon: "align-right" },
      { value: "end", label: "End", icon: "align-end" },
      { value: "justify", label: "Justify", icon: "align-justify" },
    ],
  },
  {
    property: "font-optical-sizing",
    label: "Optical sizing",
    options: [
      { value: "auto", label: "Auto", icon: "optical-auto" },
      { value: "none", label: "None", icon: "optical-none" },
    ],
  },
  {
    property: "font-variant-ligatures",
    label: "Ligatures",
    options: [
      { value: "normal", label: "Normal", icon: "ligatures-normal" },
      { value: "none", label: "None", icon: "ligatures-none" },
      { value: "common-ligatures", label: "Common", icon: "ligatures-common" },
      {
        value: "no-common-ligatures",
        label: "No common",
        icon: "ligatures-no-common",
      },
    ],
  },
] as const;
</script>
<template>
  <Card aria-labelledby="type-heading">
    <Disclosure
      id="typography"
      persist-key="typography"
      heading="h2"
      heading-id="type-heading"
      :inactive="inactive"
      :blocked="blocked"
      :open-on-activate="openOnActivate"
      default-open
    >
      <template #title
        >Typography
        <span v-if="font" class="subtle">{{ font.family }}</span></template
      >
      <template #preview>
        <span>Size</span><span>Weight</span><span>Line height</span
        ><span>Spacing</span>
      </template>
      <div :key="generation" class="numeric-grid">
        <div class="numeric-field weight-control">
          <div class="field-label">
            <span class="field-label-name">
              <Label for="font-weight">Weight</Label>
              <VariableAxisIcon v-if="weightAxis" />
            </span>
            <Button
              v-if="overridden('font-weight')"
              variant="link"
              size="icon-xs"
              class="reset-property"
              aria-label="Reset weight"
              title="Reset weight"
              @click="change('font-weight', undefined)"
            >
              <Icon name="undo" />
            </Button>
          </div>
          <NativeSelect
            id="font-weight"
            :value="
              fieldStatus('font-weight') ? '' : value('font-weight', '400')
            "
            :disabled="disabled"
            @change="weightChange(($event.target as HTMLSelectElement).value)"
          >
            <option v-if="fieldStatus('font-weight')" value="" disabled>
              {{ fieldStatus("font-weight") }}
            </option>
            <option
              v-if="customWeight && !fieldStatus('font-weight')"
              :value="customWeight"
            >
              {{ customWeight }} · Custom
            </option>
            <option v-for="w in weightChoices" :key="w" :value="w">
              {{ w }} {{ weightNames[w] ?? "" }}
            </option>
          </NativeSelect>
          <ValueSlider
            v-if="weightAxis"
            id="font-weight-slider"
            aria-label="Font weight"
            :min="weightAxis.min"
            :max="weightAxis.max"
            :step="1"
            :value="value('font-weight', '400')"
            :disabled="disabled"
            @change="weightChange(String($event))"
          />
        </div>
        <NumberField
          label="Size"
          kind="size"
          :value="value('font-size', '16px')"
          :value-status="fieldStatus('font-size')"
          :units="['px', 'rem', 'em']"
          :min="0.1"
          :max="1000"
          :step="0.1"
          :disabled="disabled"
          :overridden="overridden('font-size')"
          @change="change('font-size', $event)"
          @reset="change('font-size', undefined)"
        /><NumberField
          label="Line height"
          kind="leading"
          :value="
            value('line-height', '1.4') === 'normal'
              ? '1.4'
              : value('line-height', '1.4')
          "
          :units="['', 'px', 'em']"
          :value-status="fieldStatus('line-height')"
          :min="0.1"
          :max="300"
          :step="0.01"
          :disabled="disabled"
          :overridden="overridden('line-height')"
          @change="change('line-height', $event)"
          @reset="change('line-height', undefined)"
        /><NumberField
          label="Letter spacing"
          kind="tracking"
          :value="
            value('letter-spacing', '0px') === 'normal'
              ? '0px'
              : value('letter-spacing', '0px')
          "
          :units="['px', 'em']"
          :value-status="fieldStatus('letter-spacing')"
          :min="-20"
          :max="100"
          :step="0.01"
          :disabled="disabled"
          :overridden="overridden('letter-spacing')"
          @change="change('letter-spacing', $event)"
          @reset="change('letter-spacing', undefined)"
        />
        <NumberField
          v-if="widthAxis"
          :key="`width-${font?.id}`"
          label="Width"
          :value="`${axisValue('wdth', parseFloat(value('font-stretch', `${widthAxis.default}%`)))}%`"
          :value-status="axisStatus('wdth', widthAxis.default)"
          :units="['%']"
          :min="widthAxis.min"
          :max="widthAxis.max"
          :step="0.1"
          :disabled="disabled"
          :overridden="overridden('font-stretch') || hasAxisOverride('wdth')"
          @change="change('font-stretch', $event)"
          @reset="change('font-stretch', undefined)"
        >
          <template #label-suffix><VariableAxisIcon /></template>
        </NumberField>
        <NumberField
          v-for="axis in extraAxes"
          :key="`${font?.id}-${axis.tag}`"
          :label="axisNames[axis.tag] ?? axis.tag"
          :value="String(axisValue(axis.tag, axis.default))"
          :value-status="axisStatus(axis.tag, axis.default)"
          :units="[]"
          :min="axis.min"
          :max="axis.max"
          :step="0.1"
          :disabled="disabled"
          :overridden="hasAxisOverride(axis.tag)"
          @change="updateAxis(axis.tag, Number($event))"
          @reset="resetAxis(axis.tag)"
        >
          <template #label-suffix><VariableAxisIcon /></template>
        </NumberField>
      </div>
      <Disclosure v-model:open="advancedOpen">
        <template #title>Advanced typography</template>
        <div class="advanced-grid">
          <IconChoice
            v-for="field in advancedFields"
            :key="field.property"
            :label="field.label"
            :value="
              field.property === 'font-style' && useItalicAxis && !bulkRules
                ? italicStyle
                : (fieldStatus(field.property) ??
                  value(field.property, field.options[0].value))
            "
            :options="
              field.options.map((option) => ({
                ...option,
                disabled:
                  field.property === 'font-style' &&
                  (bulkRules
                    ? !supportsBulkChange({
                        property: 'font-style',
                        value: option.value,
                      })
                    : !useItalicAxis &&
                      !!font &&
                      !font.styles.includes(option.value) &&
                      style !== option.value),
              }))
            "
            :disabled="disabled"
            :overridden="
              overridden(field.property) ||
              (field.property === 'font-style' && hasAxisOverride('ital'))
            "
            @change="change(field.property, $event)"
            @reset="change(field.property, undefined)"
          />
        </div>
      </Disclosure>
      <Disclosure v-if="!bulkRules"
        ><template #title>Font sample</template><slot name="sample"
      /></Disclosure>
    </Disclosure>
  </Card>
</template>
