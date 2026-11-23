<script lang="ts">
  import { onMount } from 'svelte';
  import { createDecoder, openCamera, scanFrames, type Camera, type Decoder } from '../../lib/qr/scan';

  interface Props {
    open?: () => Promise<Camera>;
    decode?: Decoder;
    wait?: (ms: number) => Promise<void>;
    onDecoded: (text: string) => void;
    onClose: () => void;
  }

  let {
    open = openCamera,
    decode = createDecoder(),
    wait = (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    onDecoded,
    onClose,
  }: Props = $props();

  let video: HTMLVideoElement | undefined = $state();
  let error = $state('');

  onMount(() => {
    const ac = new AbortController();
    let camera: Camera | undefined;
    let gone = false;

    (async () => {
      try {
        camera = await open();
        if (gone) return;
        camera.video.className = 'block w-full';
        video = camera.video;
        const text = await scanFrames({ grab: () => camera!.grab(), decode, wait, signal: ac.signal });
        onDecoded(text);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          // Only the error name: browsers' messages are not user-facing text.
          error =
            (e as Error).name === 'NotAllowedError'
              ? "Sealcam can't use the camera. Allow camera access in your browser settings, or use a photo of the QR code."
              : "Sealcam can't open the camera. Use a photo of the QR code instead.";
        }
      } finally {
        camera?.stop();
      }
    })();

    return () => {
      gone = true;
      ac.abort();
      camera?.stop();
    };
  });
</script>

<section aria-label="QR scanner" class="space-y-3">
  <p>Point the camera at the QR code.</p>
  {#if video}
    <div class="relative overflow-hidden rounded bg-plate">
      <!-- The camera's own <video> element is placed here as-is. -->
      <div
        {@attach (host) => {
          host.append(video!);
        }}
      ></div>
      <span aria-hidden="true" class="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-3/5 -translate-x-1/2 -translate-y-1/2 rounded border-2 border-ink"></span>
    </div>
    <p role="status" class="text-sm text-muted">Looking for a QR code…</p>
  {/if}
  {#if error}
    <p role="alert" class="text-amber">{error}</p>
  {/if}
  <button type="button" class="min-h-11 rounded border border-rule px-4 text-ink" onclick={onClose}>Close scanner</button>
</section>
