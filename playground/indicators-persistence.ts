import { registerStatePersistence } from '../src/plugin';
import type { CellStateContext } from '../src/widget';

export interface PersistedExternalIndicator {
    id?: string;
    name: string;
    script: string;
    inputs?: Record<string, any>;
    props?: Record<string, any>;
    hidden?: boolean;
}

function cleanRecord(r?: Record<string, any>): Record<string, any> | undefined {
    if (!r || typeof r !== 'object') return undefined;
    const entries = Object.entries(r);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function registerIndicatorsPersistence(): () => void {
    return registerStatePersistence({
        key: 'quant:indicators',
        scope: 'cell',
        serialize(ctx: CellStateContext): PersistedExternalIndicator[] | undefined {
            const chart = ctx.chart;
            if (!chart || typeof chart.indicators !== 'function') return undefined;

            const list: PersistedExternalIndicator[] = [];
            for (const h of chart.indicators()) {
                // Script indicators carry their Pine Script source code
                if (h.source && typeof h.source === 'string' && h.source.trim().length > 0) {
                    const inputs = cleanRecord(h.inputValues?.());
                    const props = cleanRecord(h.propValues?.());
                    list.push({
                        id: h.id,
                        name: h.title || 'Indicator',
                        script: h.source,
                        ...(inputs ? { inputs } : {}),
                        ...(props ? { props } : {}),
                        ...(h.visible === false ? { hidden: true } : {}),
                    });
                }
            }

            return list.length > 0 ? list : undefined;
        },
        restore(payload: unknown, ctx: CellStateContext): void {
            if (!Array.isArray(payload) || payload.length === 0) return;

            const chart = ctx.chart;
            const live = chart?.indicators?.() || [];
            const liveIds = new Set(live.map((h: any) => h.id));

            for (const item of payload) {
                if (!item || typeof item.script !== 'string' || !item.script.trim()) continue;

                // If already live on the chart with this exact ID, update values/visibility
                if (item.id && liveIds.has(item.id)) {
                    const handle = live.find((h: any) => h.id === item.id);
                    if (handle) {
                        if (item.inputs) handle.setInputs(item.inputs);
                        if (item.props) handle.setProps(item.props);
                        if (item.hidden !== undefined) handle.setVisible(!item.hidden);
                    }
                    continue;
                }

                try {
                    ctx.addIndicator({
                        id: item.id,
                        name: item.name || 'Indicator',
                        script: item.script,
                        inputs: item.inputs,
                        props: item.props,
                        hidden: item.hidden,
                    });
                } catch (err) {
                    console.warn('[IndicatorsPersistence] Failed to restore indicator:', item.name, err);
                }
            }
        },
    });
}
