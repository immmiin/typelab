import { useStore, type InspectorTab } from '../store'
import { CharacterSection, FontSection, OpenTypeSection, PresetsStrip, TextSection, VariableSection } from './TypePanels'
import { ColorSection, EffectsSection } from './StylePanels'
import { DistortSection, PathSection, RepeatSection, TransformSection } from './FormPanels'
import { CanvasSection, ExportSection, LayoutSection } from './DocPanels'
import { usePrimary } from './hooks'

const TABS: { id: InspectorTab; label: string; tip: string }[] = [
  { id: 'type', label: 'Type', tip: 'Text, fonts, variable axes, OpenType, characters' },
  { id: 'style', label: 'Style', tip: 'Colour and effects' },
  { id: 'form', label: 'Form', tip: 'Transform, distort, path, repeat' },
  { id: 'doc', label: 'Document', tip: 'Artboard, grid, guides, export' },
]

export function Inspector() {
  const tab = useStore((s) => s.tab)
  const set = useStore((s) => s.set)
  const l = usePrimary()
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-panel" data-testid="inspector">
      <div className="flex h-9 shrink-0 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            data-tip={t.tip}
            data-tab={t.id}
            onClick={() => set({ tab: t.id })}
            className={`relative flex-1 text-2xs font-semibold uppercase tracking-[0.14em] ${tab === t.id ? 'text-ink' : 'text-mute hover:text-ink'}`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-3 bottom-0 h-[2px] bg-accent" />}
          </button>
        ))}
      </div>
      <div className="tl-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {tab === 'type' && (
          <>
            {l && l.type === 'shape' && <p className="px-3 py-3 text-[10px] text-mute">A shape is selected. Its colour and effects live under Style; position under Form.</p>}
            <TextSection />
            <PresetsStrip />
            <VariableSection />
            <OpenTypeSection />
            <CharacterSection />
            <FontSection />
          </>
        )}
        {tab === 'style' && (
          <>
            <ColorSection />
            <EffectsSection />
          </>
        )}
        {tab === 'form' && (
          <>
            <TransformSection />
            {l?.type === 'text' && (
              <>
                <DistortSection />
                <PathSection />
              </>
            )}
            <RepeatSection />
          </>
        )}
        {tab === 'doc' && (
          <>
            <CanvasSection />
            <LayoutSection />
            <ExportSection />
          </>
        )}
      </div>
    </aside>
  )
}
