import { onBeforeUnmount } from 'vue'
import { onIonViewDidEnter, onIonViewDidLeave } from '@ionic/vue'

interface IonBackButtonDetail {
  register: (priority: number, handler: () => void | Promise<void>) => void
}

export function useActiveHardwareBack(
  handler: () => void | Promise<void>,
  priority = 100,
): void {
  let listening = false
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<IonBackButtonDetail>).detail
    detail?.register(priority, handler)
  }

  function register(): void {
    if (listening) return
    document.addEventListener('ionBackButton', listener)
    listening = true
  }

  function unregister(): void {
    if (!listening) return
    document.removeEventListener('ionBackButton', listener)
    listening = false
  }

  onIonViewDidEnter(register)
  onIonViewDidLeave(unregister)
  onBeforeUnmount(unregister)
}
