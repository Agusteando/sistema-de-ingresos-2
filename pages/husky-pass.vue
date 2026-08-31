<template>
  <main class="husky-neutral-page">
    <section class="husky-neutral-card" aria-labelledby="husky-neutral-title">
      <img
        class="husky-neutral-brand"
        src="/brand/husky-pass-header-gray.png"
        alt="Husky Pass"
      />

      <div class="husky-neutral-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 3.25 19 6.4v4.75c0 4.4-2.82 7.98-7 9.6-4.18-1.62-7-5.2-7-9.6V6.4l7-3.15Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
          <path d="m9.1 12 1.8 1.8 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <h1 id="husky-neutral-title">Código Husky Pass</h1>
      <p>
        Este código es de uso exclusivo del sistema institucional de acceso.
      </p>
      <p class="husky-neutral-secondary">
        No hay información personal disponible desde esta página.
      </p>
    </section>
  </main>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false
})

useHead({
  title: 'Husky Pass | IECS-IEDIS',
  meta: [
    { name: 'robots', content: 'noindex, nofollow, noarchive' },
    { name: 'referrer', content: 'no-referrer' }
  ]
})
</script>

<style scoped>
.husky-neutral-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at top, rgba(211, 221, 224, 0.52), transparent 42%),
    #f6f7f7;
  color: #26383d;
  font-family: 'Montserrat', Arial, sans-serif;
}

.husky-neutral-card {
  width: min(100%, 420px);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 28px 32px;
  border: 1px solid rgba(84, 108, 115, 0.14);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 52px rgba(31, 51, 57, 0.09);
}

.husky-neutral-brand {
  width: min(220px, 72vw);
  height: auto;
  object-fit: contain;
  margin-bottom: 28px;
}

.husky-neutral-icon {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  margin-bottom: 22px;
  border-radius: 22px;
  background: #edf2f3;
  color: #506b72;
}

.husky-neutral-icon svg {
  width: 36px;
  height: 36px;
}

h1 {
  margin: 0;
  font-family: 'Fredoka', 'Montserrat', Arial, sans-serif;
  font-size: clamp(1.72rem, 6vw, 2.05rem);
  font-weight: 600;
  letter-spacing: -0.02em;
}

p {
  max-width: 32ch;
  margin: 14px 0 0;
  font-size: 0.98rem;
  line-height: 1.65;
  font-weight: 600;
  color: #52666b;
}

.husky-neutral-secondary {
  margin-top: 7px;
  font-size: 0.9rem;
  font-weight: 500;
  color: #78898d;
}

@media (max-width: 480px) {
  .husky-neutral-page {
    padding: 18px;
  }

  .husky-neutral-card {
    padding: 30px 22px 28px;
    border-radius: 24px;
  }
}
</style>
