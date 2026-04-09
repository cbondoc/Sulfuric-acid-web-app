export function ProcessInfo() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-stone-900">Process Information</h2>
        <p className="text-sm text-stone-600">Mixing sequence, safety, and timing</p>
      </div>

      <div className="max-w-none space-y-8">
        <section className="rounded-xl border border-stone-200 bg-stone-50 p-6">
          <h3 className="mb-3 text-lg font-medium text-amber-800">Mixing sequence</h3>
          <p className="text-stone-700">
            One full product cycle runs the following steps in order, with one relay active at a
            time:
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-stone-700">
            <li>
              <strong className="text-stone-900">Container Acid</strong> — Acid is dispensed into
              the container.
            </li>
            <li>
              <strong className="text-stone-900">Container Water</strong> — Water is added.
            </li>
            <li>
              <strong className="text-stone-900">Mixer</strong> — Mixing runs for the set
              duration.
            </li>
            <li>
              <strong className="text-stone-900">Container Rest</strong> — Rest step runs twice
              per cycle.
            </li>
          </ol>
          <p className="mt-3 text-stone-600">
            After the last step, the sequence restarts. Each full run counts as one product made.
          </p>
        </section>

        <section className="rounded-xl border border-stone-200 bg-stone-50 p-6">
          <h3 className="mb-3 text-lg font-medium text-amber-800">Process timing overview</h3>
          <ul className="list-disc space-y-1 pl-5 text-stone-700">
            <li>Container Acid, Water, and Rest: configurable (e.g. 30 s each).</li>
            <li>Mixer: configurable (e.g. 10 s).</li>
            <li>Container Rest is repeated twice per cycle.</li>
            <li>Short pause between relays; delay before restarting the sequence.</li>
          </ul>
        </section>

        <section className="rounded-xl border border-amber-300 bg-yellow-50 p-6">
          <h3 className="mb-3 text-lg font-medium text-amber-800">Safety notes</h3>
          <ul className="list-disc space-y-2 pl-5 text-stone-700">
            <li>Sulfuric acid is corrosive. Use appropriate PPE and handling procedures.</li>
            <li>Always add acid to water, not water to concentrated acid.</li>
            <li>Ensure ventilation and spill containment where applicable.</li>
            <li>
              This dashboard can send start/stop commands. Verify the area is safe before pressing Run.
            </li>
          </ul>
        </section>

        <section className="rounded-xl border border-stone-200 bg-stone-50 p-6">
          <h3 className="mb-3 text-lg font-medium text-amber-800">Disclaimer</h3>
          <p className="text-sm text-stone-600">
            Information shown here is for operational awareness only. Process parameters, safety
            limits, and compliance are the responsibility of the facility operator. Verify all
            settings and procedures against your local standards and regulations.
          </p>
        </section>
      </div>
    </div>
  );
}
