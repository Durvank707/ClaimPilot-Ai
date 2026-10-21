import type { ComponentType, SVGProps } from 'react'
import {
  HistoryIcon,
  LookupIcon,
  NewClaimIcon,
  OverviewIcon,
} from '../components/icons'

export type ViewId = 'overview' | 'new-claim' | 'history' | 'lookup'

export interface NavItem {
  id: ViewId
  label: string
  /** Short description used in the header and on the destination page. */
  description: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'overview',
    label: 'Dashboard',
    description: 'Operational summary of persisted analyses and reviews.',
    icon: OverviewIcon,
  },
  {
    id: 'new-claim',
    label: 'New Claim Analysis',
    description: 'Submit a claim for fraud, severity, anomaly and risk review.',
    icon: NewClaimIcon,
  },
  {
    id: 'history',
    label: 'Claims History',
    description: 'Browse previously analysed claims.',
    icon: HistoryIcon,
  },
  {
    id: 'lookup',
    label: 'Claim Lookup',
    description: 'Retrieve a claim or analysis by its identifier.',
    icon: LookupIcon,
  },
]

export function getNavItem(id: ViewId): NavItem {
  return NAV_ITEMS.find((item) => item.id === id) ?? NAV_ITEMS[0]
}
