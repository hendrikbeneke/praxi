import { OrderButtons } from '@/components/catalogue-controls'

export function ErsterEintrag() {
  return <OrderButtons index={0} count={4} pending={false} onMove={() => {}} />
}

export function MittlererEintrag() {
  return <OrderButtons index={1} count={4} pending={false} onMove={() => {}} />
}

export function LetzterEintrag() {
  return <OrderButtons index={3} count={4} pending={false} onMove={() => {}} />
}
