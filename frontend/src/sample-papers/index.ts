import cnn from './cnn_image_classification.tex?raw'
import lstm from './lstm_time_series.tex?raw'
import gnn from './gnn_molecular_property.tex?raw'
import gan from './gan_image_synthesis.tex?raw'
import contrastive from './contrastive_self_supervised.tex?raw'

export interface SamplePaper {
  slug: string
  title: string
  source: string
}

export const SAMPLE_PAPERS: SamplePaper[] = [
  { slug: 'cnn_image_classification',   title: 'Deep Residual Learning for Image Classification',                source: cnn },
  { slug: 'lstm_time_series',           title: 'Gated Recurrent Memory for Long-Horizon Time-Series Forecasting', source: lstm },
  { slug: 'gnn_molecular_property',     title: 'Message-Passing Graph Neural Networks for Molecular Property Prediction', source: gnn },
  { slug: 'gan_image_synthesis',        title: 'Progressive Growing GANs for High-Fidelity Image Synthesis',     source: gan },
  { slug: 'contrastive_self_supervised', title: 'Contrastive Self-Supervised Pretraining without Negative Pairs', source: contrastive },
]
