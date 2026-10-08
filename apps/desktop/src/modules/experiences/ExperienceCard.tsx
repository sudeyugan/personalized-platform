import type { Asset } from '../../domain/models'
import { categoryLabels, type ExperienceEntry, type ExperienceData } from '../../domain/experiences'
import { ExperienceArtwork } from './ExperienceArtwork'

export function ExperienceCard({ entry, asset, labels, onOpen }: { entry: ExperienceEntry; asset?: Asset; labels: ExperienceData['tierLabels']; onOpen: () => void }) {
  return <button type="button" className={'experience-card paper-' + entry.paperStyle + (entry.category === 'place' ? ' experience-card-place' : '')} onClick={onOpen} aria-label={'查看' + entry.title}>
    <div className="experience-card-mat"><ExperienceArtwork entry={entry} asset={asset} />{entry.tier && <span className={'experience-tier tier-' + entry.tier}>{labels[entry.tier]}</span>}</div>
    <div className="experience-card-writing">
      <h3 title={entry.title}>{entry.title}</h3>{entry.creator.trim() && <small title={entry.creator}>{entry.creator}</small>}
      {entry.note.trim() && <p>{entry.note}</p>}
      <div className="experience-card-meta"><span>{categoryLabels[entry.category]}</span>{entry.dateText.trim() && <span>{entry.dateText}</span>}</div>
    </div>
  </button>
}
