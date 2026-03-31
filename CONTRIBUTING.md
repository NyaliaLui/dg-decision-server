# Contributing to dg-decision-server

Thank you for your interest in contributing to dg-decision-server! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

### Our Standards

We are committed to providing a welcoming and inclusive environment for all contributors. We expect all participants to:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Accept constructive criticism gracefully
- Focus on what is best for the community and project
- Show empathy towards other community members

### Unacceptable Behavior

The following behaviors are considered unacceptable:

- Harassment, intimidation, or discrimination in any form
- Offensive comments related to personal characteristics
- Publishing others' private information without permission
- Trolling, insulting/derogatory comments, or personal attacks
- Other conduct which could reasonably be considered inappropriate in a professional setting

### Enforcement

Project maintainers have the right to remove, edit, or reject contributions that do not align with this Code of Conduct. Instances of unacceptable behavior may be reported to the project team for review.

## Guildelines for Issues & Bug Reports

### Before Submitting an Issue or Bug Report

- Check the existing issues to avoid duplicates
- Verify the bug exists on the latest version
- Collect and include relevant information about your environment

### How to Submit an Issue or Bug Report

Create an issue with the following information:

**Title:** Use the format `<folder>/<filename stem>: subject line`
The filename stem is optional here.

Examples:
- `app: rendering error on initial load`
- `components/header: navigation links not working`
- `lib/utils: helper function returns incorrect value`

**Description should include:**
- **Expected Behavior:** What you expected to happen
- **Actual Behavior:** What actually happened
- **Steps to Reproduce:** Detailed steps to reproduce the issue
  1. Step one
  2. Step two
  3. Step three
- **Environment:**
  - Node.js version
  - Browser and version (if applicable)
  - Any other relevant configuration
- **Screenshots/Logs:** If applicable, add screenshots or error logs
- **Possible Solution:** If you have insights into the cause or fix (optional)
- **Labels:** Appropriate GitHub labels that describe the type of problem (e.g., `bug`, `enhancement`, `documentation`, `question`, `help wanted`)

## Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/dg-decision-server.git`
3. Install dependencies: `npm install`
4. Create a branch for your changes (see Branch Naming below)

## Commit Message Structure

We follow a structured commit message format to maintain a clean and readable git history.

### Format

```
<folder>/[filename stem]: <subject>

<body>

<footer>
```

### Subject Line

- Use the format: `<folder>/[filename stem>]: <subject>`
  - The filename stem is optional here
- Use imperative, present tense: "add" not "added" or "adds"
- Don't capitalize the first letter after the colon
- No period (.) at the end
- Maximum 50 characters

### Body (Optional)

- Use the body to explain **what** and **why** vs. **how**
- Separate from subject with a blank line
- Capitalize the first letter of the body
- Wrap at 72 characters

### Footer (Optional)

- Reference issues: `Closes #123` or `Fixes #456`
- Note breaking changes if applicable

### Examples

```
app/page: add spinning cube

Initialize a ThreeJS canvas with a spinning cube.

Fixes #1
```

```
components/header: fix navigation menu overflow

Prevent navigation menu items from overflowing on mobile
devices by implementing a responsive hamburger menu.

Fixes #42
```

```
lib/utils: refactor date formatting helper

Simplify the date formatting logic and add support for
additional locales.
```

```
docs: update commit message guidelines
```

## Branch Naming

Branch names should reference the GitHub issue number they address.

### Format

```
issue<number>
```

### Examples

```
issue1
issue5
issue42
```

## Submitting a Pull Request

### Before Submitting

1. **Ensure your code follows project conventions**
   - Run prettier: `npm run format`
   - Run tests: `npm run test` and `npm run e2e`
   - Build successfully: `npm run build`

2. **Update documentation** if you're changing functionality

3. **Add tests** for new features or bug fixes

4. **Commit your changes** following the commit message structure

### Pull Request Process

1. **Push your branch** to your forked repository
   ```bash
   git push origin issue<number>
   ```

2. **Create a Pull Request** from your branch to the `main` branch of the original repository

3. **Fill out the PR template** with the following information:

   **Title:** Use the format `<folder>: subject line`

   Examples:
   - `app: initialize threejs canvas`
   - `components: fix navigation menu overflow`
   - `lib: refactor date formatting helper`

   **Description should include:**
   - **Summary:** A clear description of the changes introduced by this PR
   - **Labels:** Appropriate GitHub labels that describe the type of change (e.g., `bug`, `enhancement`, `documentation`, `refactor`)
   - **Related Issues:** Link to related issues using keywords like `Fixes #123`, `Closes #456`, or `Related to #789`

4. **Respond to feedback** from code reviewers promptly

5. **Keep your PR updated** by rebasing on the latest `main` branch 

### PR Review Process

- At least one maintainer will review your PR
- Reviews may request changes or improvements
- Once approved, a maintainer will merge your PR
- Your contribution will be included in the next release

### After Your PR is Merged

- Delete your feature branch (both locally and on GitHub)
- Pull the latest changes from `main`
- Celebrate your contribution! 🎉

## Questions or Need Help?

If you have questions or need help with the contribution process, feel free to:
- Open an issue with the label `question`
- Reach out to the project maintainers

Thank you for contributing to dg-decision-server!
