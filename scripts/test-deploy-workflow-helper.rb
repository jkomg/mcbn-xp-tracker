#!/usr/bin/env ruby
# Run with: ruby scripts/test-deploy-workflow-helper.rb (Ruby standard library only).
# Exercise the actual workflow shell steps after checking out an older app commit.
require 'yaml'
require 'tmpdir'
require 'fileutils'
require 'open3'

ROOT = File.expand_path('..', __dir__)

def run!(env, command, directory)
  output, status = Open3.capture2e(env, 'bash', '-e', '-o', 'pipefail', '-c', command, chdir: directory)
  raise "Command failed: #{command}\n#{output}" unless status.success?
  output
end

%w[deploy-web-dev.yml deploy-web.yml].each do |name|
  workflow = YAML.load_file(File.join(ROOT, '.github/workflows', name))
  steps = workflow.fetch('jobs').values.first.fetch('steps')
  helper_checkout = steps.find { |s| s['name'] == 'Checkout workflow helper' }
  if helper_checkout
    raise "#{name}: helper must come from workflow SHA" unless helper_checkout.dig('with', 'ref') == '${{ github.workflow_sha }}'
  end
  prepare = steps.find { |s| s['name'] == 'Preserve deploy helper' }
  app_checkout = steps.find { |s| s['name'] == 'Checkout' }
  deploy = steps.find { |s| s.fetch('run', '').include?('gcloud run deploy') }
  if helper_checkout && prepare
    raise "#{name}: incorrect checkout order" unless steps.index(helper_checkout) < steps.index(prepare) && steps.index(prepare) < steps.index(app_checkout)
  end
  raise "#{name}: app SHA changed" unless app_checkout.dig('with', 'ref') == '${{ steps.sha.outputs.sha }}'
  if name == 'deploy-web.yml'
    [helper_checkout, prepare, app_checkout, deploy].compact.each do |step|
      raise "#{name}: superseded gate missing" unless step['if'] == "steps.sha.outputs.superseded == 'false'"
    end
  end

  Dir.mktmpdir('deploy-helper-regression') do |tmp|
    app = File.join(tmp, 'app')
    runner_temp = File.join(tmp, 'runner-temp')
    bin = File.join(tmp, 'bin')
    FileUtils.mkdir_p([app, runner_temp, bin])
    env = {'RUNNER_TEMP' => runner_temp, 'GITHUB_WORKSPACE' => app, 'PATH' => "#{bin}:#{ENV.fetch('PATH')}", 'DEPLOY_ARGS' => File.join(tmp, 'args')}
    run!(env, 'git init -q && git config user.email regression@example.invalid && git config user.name Regression', app)
    File.write(File.join(app, 'app.txt'), 'old application revision')
    run!(env, 'git add app.txt && git commit -qm "Old app without deploy helper"', app)
    old_sha = run!(env, 'git rev-parse HEAD', app).strip
    FileUtils.mkdir_p(File.join(app, 'scripts'))
    FileUtils.cp(File.join(ROOT, 'scripts/cloud-run-deploy-retry.sh'), File.join(app, 'scripts'))
    run!(env, 'git add scripts && git commit -qm "Workflow with deploy helper"', app)
    run!(env, prepare.fetch('run'), app) if prepare
    run!(env, "git checkout -q #{old_sha}", app)
    raise 'Historical app unexpectedly contains helper' if File.exist?(File.join(app, 'scripts/cloud-run-deploy-retry.sh'))

    File.write(File.join(bin, 'gcloud'), "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > \"$DEPLOY_ARGS\"\n")
    FileUtils.chmod(0755, File.join(bin, 'gcloud'))
    # Render expressions to inert values; no credentials or live gcloud calls.
    command = deploy.fetch('run').gsub(/\$\{\{\s*(.*?)\s*\}\}/) do
      Regexp.last_match(1).strip == 'steps.sha.outputs.sha' ? old_sha : 'fixture-value'
    end
    run!(env, command, app)
    args = File.readlines(env.fetch('DEPLOY_ARGS'), chomp: true)
    raise 'Deployment did not use requested historical image' unless args.include?("fixture-value:#{old_sha}")
    raise 'Application checkout changed' unless run!(env, 'git rev-parse HEAD', app).strip == old_sha
    puts "PASS #{name}: deploys historical app with preserved workflow helper"
  end
end
