require 'xcodeproj'
project_path = 'ios/allin1.xcodeproj'
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == 'allin1' }
group = project.main_group.find_subpath('allin1/Fonts', true)
group.set_source_tree('<group>')
group.set_path('Fonts')

existing_files = target.resources_build_phase.files.map { |f| f.file_ref.name if f.file_ref }.compact

Dir.glob('ios/allin1/Fonts/*.ttf').each do |file|
  base_name = File.basename(file)
  unless existing_files.include?(base_name)
    file_ref = group.new_reference(base_name)
    target.resources_build_phase.add_file_reference(file_ref, true)
  end
end
project.save
