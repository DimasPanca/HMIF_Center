-- 043_rundown_hapus_panitia — panitia acara boleh menghapus baris rundown (T-094).
--
-- 015b memberi panitia acara (my_kepanitiaan) hak INSERT dan UPDATE rundown,
-- tetapi DELETE hanya untuk ADMIN/KETUA/WAKIL/KADEPT. Editor TOR (T-094)
-- menyunting rundown sebagai satu tabel: baris yang dihapus panitia dari tabel
-- harus hilang juga dari DB — kalau tidak, rundown "satu sumber" untuk TOR,
-- Proposal, dan Surat Undangan memuat baris yang sudah dibuang penyusunnya.
-- Guard aplikasi (lib/tor/service.ts bisaTulisTor) memakai aturan yang sama.
--
-- Sumber: docs/ai/tasks/P6-tor-proposal.md T-094 · migrasi 012, 015b

DROP POLICY IF EXISTS rundown_delete ON rundown;
CREATE POLICY rundown_delete ON rundown FOR DELETE
  USING (has_role('ADMIN','KETUA','WAKIL','KADEPT')
         OR kepanitiaan_id = ANY(my_kepanitiaan()));
