// Approved native composition; the existing components and controls stay connected.
document.addEventListener('DOMContentLoaded', () => {
  const streak = document.querySelector('#tab-diary .streak-hero');
  const archive = document.querySelector('#tab-diary .diary-archive');
  if (streak && archive) archive.after(streak);
  const metrics = document.querySelector('#tab-profile .profile-metrics');
  const people = document.querySelector('#tab-profile .profile-people');
  if (metrics && people) people.after(metrics);
});
