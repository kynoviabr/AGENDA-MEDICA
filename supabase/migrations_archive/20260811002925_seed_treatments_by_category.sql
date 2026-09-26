-- Seed catalog for the model clinic.
-- Idempotent: updates matching treatments and inserts only missing ones.

WITH catalog(category_name, name, description, duration_minutes, num_sessions, price, default_price, min_price, cost) AS (
  VALUES
    ('Estética Facial', 'Limpeza de pele profunda', 'Higienização, emoliência, extração, alta frequência e máscara calmante. Materiais: sabonete facial, esfoliante, emoliente, vapor/ozônio, curetas, luvas, gaze, alta frequência, máscara e filtro solar.', 90, 1, 180.00, 180.00, 150.00, 45.00),
    ('Estética Facial', 'Limpeza de pele premium com LED', 'Limpeza facial profunda com finalização em LED para controle de oleosidade e recuperação da pele. Materiais: kit de limpeza, máscara calmante, LED, sérum reparador, gaze e filtro solar.', 100, 1, 240.00, 240.00, 190.00, 65.00),
    ('Estética Facial', 'Hidratação facial intensiva', 'Protocolo de hidratação para peles ressecadas ou sensibilizadas. Materiais: higienizante, tônico, sérum hidratante, máscara oclusiva, massageador facial e protetor solar.', 60, 1, 160.00, 160.00, 130.00, 40.00),
    ('Estética Facial', 'Revitalização com vitamina C', 'Tratamento antioxidante para luminosidade, viço e textura. Materiais: limpeza facial, vitamina C, máscara revitalizante, fotoproteção e descartáveis.', 60, 1, 190.00, 190.00, 150.00, 50.00),
    ('Estética Facial', 'Microagulhamento facial', 'Indicado para textura, cicatrizes superficiais e rejuvenescimento. Materiais: dermapen/roller, cartucho estéril, anestésico conforme protocolo, sérum reparador, luvas e máscara.', 75, 3, 420.00, 420.00, 350.00, 95.00),
    ('Estética Facial', 'Dermaplaning', 'Esfoliação mecânica com lâmina para remoção de células mortas e pelos finos. Materiais: lâmina estéril, antisséptico, máscara calmante, sérum e filtro solar.', 50, 1, 170.00, 170.00, 140.00, 35.00),
    ('Estética Facial', 'Radiofrequência facial', 'Tecnologia para estímulo de colágeno e melhora de flacidez leve. Materiais: aparelho de radiofrequência, gel condutor, higienizante e finalizador.', 45, 6, 220.00, 220.00, 180.00, 45.00),
    ('Estética Facial', 'Ultrassom microfocado facial', 'Protocolo de tecnologia para lifting não cirúrgico em face. Materiais: equipamento de ultrassom microfocado, transdutores, gel condutor e materiais descartáveis.', 75, 1, 1200.00, 1200.00, 950.00, 220.00),
    ('Estética Facial', 'Tratamento para olheiras estéticas', 'Protocolo cosmético para hidratação, drenagem e luminosidade da região dos olhos. Materiais: dermocosméticos específicos, máscara periocular, massageador e protetor solar.', 45, 4, 210.00, 210.00, 170.00, 50.00),
    ('Estética Facial', 'Rejuvenescimento facial global', 'Combinação de limpeza, estímulo de colágeno e ativos antioxidantes. Materiais: kit facial, séruns, radiofrequência ou LED conforme avaliação, máscara e fotoproteção.', 90, 4, 360.00, 360.00, 300.00, 85.00),

    ('Peelings', 'Peeling químico clareador', 'Protocolo para manchas superficiais e uniformização do tom. Materiais: solução clareadora, neutralizante quando indicado, máscara calmante, luvas, pincel e filtro solar.', 45, 4, 260.00, 260.00, 210.00, 60.00),
    ('Peelings', 'Peeling antiacne', 'Tratamento para controle de oleosidade, comedões e acne leve. Materiais: ácidos seborreguladores, higienizante, máscara secativa, descartáveis e fotoproteção.', 45, 4, 240.00, 240.00, 195.00, 55.00),
    ('Peelings', 'Peeling de ácido glicólico', 'Renovação superficial para textura e luminosidade. Materiais: ácido glicólico, neutralizante, pincel, máscara calmante e filtro solar.', 40, 4, 220.00, 220.00, 180.00, 45.00),
    ('Peelings', 'Peeling de retinol', 'Renovação cutânea com foco em textura, linhas finas e viço. Materiais: retinol profissional, preparo de pele, máscara reparadora, luvas e orientações pós-procedimento.', 45, 3, 280.00, 280.00, 230.00, 70.00),
    ('Peelings', 'Peeling mandélico pele sensível', 'Renovação suave para peles sensíveis ou com tendência a irritação. Materiais: ácido mandélico, máscara calmante, água termal, gaze e protetor solar.', 40, 4, 230.00, 230.00, 190.00, 50.00),
    ('Peelings', 'Peeling tranexâmico para melasma', 'Protocolo estético para apoio ao clareamento de manchas. Materiais: ativo tranexâmico, veículo profissional, máscara calmante, pincel e fotoproteção.', 45, 4, 290.00, 290.00, 240.00, 75.00),
    ('Peelings', 'Peeling enzimático facial', 'Renovação suave sem ácidos agressivos, indicada para luminosidade. Materiais: enzimas profissionais, higienizante, máscara hidratante e protetor solar.', 40, 1, 190.00, 190.00, 150.00, 40.00),
    ('Peelings', 'Peeling corporal clareador', 'Protocolo para áreas corporais com hiperpigmentação estética. Materiais: solução corporal, luvas, pincel, hidratante reparador e orientação domiciliar.', 60, 4, 320.00, 320.00, 260.00, 85.00),
    ('Peelings', 'Peeling para poros dilatados', 'Protocolo para textura, oleosidade e aparência de poros. Materiais: ativos renovadores, máscara seborreguladora, gaze, pincel e filtro solar.', 45, 4, 240.00, 240.00, 195.00, 55.00),
    ('Peelings', 'Peeling glow', 'Peeling leve de luminosidade para eventos e manutenção. Materiais: blend iluminador, máscara hidratante, sérum glow e fotoproteção.', 40, 1, 210.00, 210.00, 170.00, 45.00),

    ('Celulite e Flacidez', 'Radiofrequência corporal', 'Tecnologia para flacidez corporal e estímulo de colágeno. Materiais: radiofrequência, gel condutor, fita métrica, descartáveis e finalizador corporal.', 60, 8, 260.00, 260.00, 210.00, 55.00),
    ('Celulite e Flacidez', 'Endermoterapia corporal', 'Massagem mecânica assistida para celulite e circulação. Materiais: aparelho de endermoterapia, malha individual, higienização e creme finalizador.', 50, 10, 220.00, 220.00, 180.00, 45.00),
    ('Celulite e Flacidez', 'Tratamento de celulite grau I e II', 'Protocolo combinado para celulite leve a moderada. Materiais: dermocosméticos lipolíticos, massagem modeladora, radiofrequência ou endermoterapia.', 60, 8, 240.00, 240.00, 195.00, 55.00),
    ('Celulite e Flacidez', 'Tratamento de celulite grau III', 'Protocolo intensivo com tecnologias e ativos para celulite avançada. Materiais: endermoterapia, radiofrequência, ativos corporais, descartáveis e avaliação periódica.', 75, 10, 320.00, 320.00, 260.00, 80.00),
    ('Celulite e Flacidez', 'Tratamento de flacidez abdominal', 'Tratamento para melhora visual de flacidez em abdômen. Materiais: radiofrequência, gel condutor, ativos firmadores, fita métrica e registros fotográficos.', 60, 8, 280.00, 280.00, 230.00, 65.00),
    ('Celulite e Flacidez', 'Protocolo glúteos firmes', 'Protocolo de estímulo e tonificação estética de glúteos. Materiais: pump, radiofrequência ou corrente, creme firmador, descartáveis e avaliação.', 60, 8, 290.00, 290.00, 240.00, 70.00),
    ('Celulite e Flacidez', 'Pump up glúteos', 'Sessão de vácuo para melhora temporária de contorno e aspecto dos glúteos. Materiais: equipamento pump, higienizante, descartáveis e creme finalizador.', 45, 6, 180.00, 180.00, 145.00, 35.00),
    ('Celulite e Flacidez', 'Microagulhamento para estrias', 'Estimulação estética para melhora de textura em estrias. Materiais: dermapen, cartucho estéril, antisséptico, sérum reparador, luvas e máscara.', 60, 4, 360.00, 360.00, 300.00, 90.00),
    ('Celulite e Flacidez', 'Drenomodeladora', 'Técnica manual combinando drenagem e modeladora corporal. Materiais: creme corporal, lençol descartável, luvas quando indicado e fita métrica.', 60, 6, 190.00, 190.00, 155.00, 30.00),
    ('Celulite e Flacidez', 'Protocolo pernas leves', 'Protocolo para sensação de peso, edema estético e circulação. Materiais: drenagem, criogel, bandagens frias, creme finalizador e descartáveis.', 50, 6, 180.00, 180.00, 145.00, 35.00),

    ('Emagrecimento', 'Avaliação corporal com bioimpedância', 'Avaliação de composição corporal para início e acompanhamento de protocolos. Materiais: bioimpedância, fita métrica, adipômetro quando indicado e ficha de avaliação.', 40, 1, 120.00, 120.00, 90.00, 20.00),
    ('Emagrecimento', 'Programa redução de medidas 4 semanas', 'Pacote de acompanhamento corporal com tecnologias e medidas semanais. Materiais: fita métrica, ativos corporais, radiofrequência/cavitação conforme avaliação e registros.', 60, 8, 1600.00, 1600.00, 1300.00, 320.00),
    ('Emagrecimento', 'Programa redução de medidas 8 semanas', 'Programa intensivo para redução de medidas com acompanhamento quinzenal. Materiais: avaliação corporal, tecnologias combinadas, ativos, descartáveis e relatório evolutivo.', 60, 16, 2800.00, 2800.00, 2300.00, 560.00),
    ('Emagrecimento', 'Ultrassom cavitacional', 'Tecnologia estética para gordura localizada conforme avaliação. Materiais: aparelho de cavitação, gel condutor, fita métrica, descartáveis e hidratação final.', 50, 8, 240.00, 240.00, 195.00, 50.00),
    ('Emagrecimento', 'Criolipólise abdômen', 'Sessão de criolipólise para abdômen conforme indicação e avaliação. Materiais: aparelho, manta anticongelante, gel, descartáveis e documentação fotográfica.', 75, 1, 850.00, 850.00, 700.00, 180.00),
    ('Emagrecimento', 'Criolipólise flancos', 'Sessão de criolipólise para flancos conforme indicação e avaliação. Materiais: aparelho, manta anticongelante, gel, descartáveis e acompanhamento.', 75, 1, 900.00, 900.00, 740.00, 190.00),
    ('Emagrecimento', 'Protocolo detox corporal', 'Protocolo corporal de drenagem, ativos e sudorese assistida. Materiais: argila ou ativos detox, manta térmica, filme osmótico, creme e descartáveis.', 70, 4, 260.00, 260.00, 210.00, 60.00),
    ('Emagrecimento', 'Manta térmica com ativos', 'Sessão de termoterapia associada a ativos corporais. Materiais: manta térmica, creme/gel ativo, filme osmótico, lençol descartável e hidratação.', 50, 6, 190.00, 190.00, 155.00, 40.00),
    ('Emagrecimento', 'Envoltório corporal redutor', 'Bandagem e ativos para protocolo estético de medidas. Materiais: bandagens, ativos redutores, filme osmótico, luvas e fita métrica.', 60, 6, 210.00, 210.00, 170.00, 50.00),
    ('Emagrecimento', 'Protocolo barriga zero', 'Protocolo combinado para abdômen com medidas e tecnologias. Materiais: cavitação ou radiofrequência, gel condutor, ativos corporais, fita métrica e descartáveis.', 60, 8, 290.00, 290.00, 240.00, 70.00)
),
target_clinics AS (
  SELECT id
  FROM public.clinics
  WHERE lower(name) LIKE '%clinica modelo%'
     OR lower(name) LIKE '%clínica modelo%'
),
target_categories AS (
  SELECT tc.id, tc.clinic_id, tc.name
  FROM public.treatment_categories tc
  JOIN target_clinics c ON c.id = tc.clinic_id
  WHERE tc.status = 'active'
)
UPDATE public.treatments t
SET
  category_id = tc.id,
  category = catalog.category_name,
  description = catalog.description,
  duration_minutes = catalog.duration_minutes,
  num_sessions = catalog.num_sessions,
  price = catalog.price,
  default_price = catalog.default_price,
  min_price = catalog.min_price,
  cost = catalog.cost,
  is_active = true,
  updated_at = now()
FROM catalog
JOIN target_categories tc ON tc.name = catalog.category_name
WHERE t.clinic_id = tc.clinic_id
  AND t.name = catalog.name;

WITH catalog(category_name, name, description, duration_minutes, num_sessions, price, default_price, min_price, cost) AS (
  VALUES
    ('Estética Facial', 'Limpeza de pele profunda', 'Higienização, emoliência, extração, alta frequência e máscara calmante. Materiais: sabonete facial, esfoliante, emoliente, vapor/ozônio, curetas, luvas, gaze, alta frequência, máscara e filtro solar.', 90, 1, 180.00, 180.00, 150.00, 45.00),
    ('Estética Facial', 'Limpeza de pele premium com LED', 'Limpeza facial profunda com finalização em LED para controle de oleosidade e recuperação da pele. Materiais: kit de limpeza, máscara calmante, LED, sérum reparador, gaze e filtro solar.', 100, 1, 240.00, 240.00, 190.00, 65.00),
    ('Estética Facial', 'Hidratação facial intensiva', 'Protocolo de hidratação para peles ressecadas ou sensibilizadas. Materiais: higienizante, tônico, sérum hidratante, máscara oclusiva, massageador facial e protetor solar.', 60, 1, 160.00, 160.00, 130.00, 40.00),
    ('Estética Facial', 'Revitalização com vitamina C', 'Tratamento antioxidante para luminosidade, viço e textura. Materiais: limpeza facial, vitamina C, máscara revitalizante, fotoproteção e descartáveis.', 60, 1, 190.00, 190.00, 150.00, 50.00),
    ('Estética Facial', 'Microagulhamento facial', 'Indicado para textura, cicatrizes superficiais e rejuvenescimento. Materiais: dermapen/roller, cartucho estéril, anestésico conforme protocolo, sérum reparador, luvas e máscara.', 75, 3, 420.00, 420.00, 350.00, 95.00),
    ('Estética Facial', 'Dermaplaning', 'Esfoliação mecânica com lâmina para remoção de células mortas e pelos finos. Materiais: lâmina estéril, antisséptico, máscara calmante, sérum e filtro solar.', 50, 1, 170.00, 170.00, 140.00, 35.00),
    ('Estética Facial', 'Radiofrequência facial', 'Tecnologia para estímulo de colágeno e melhora de flacidez leve. Materiais: aparelho de radiofrequência, gel condutor, higienizante e finalizador.', 45, 6, 220.00, 220.00, 180.00, 45.00),
    ('Estética Facial', 'Ultrassom microfocado facial', 'Protocolo de tecnologia para lifting não cirúrgico em face. Materiais: equipamento de ultrassom microfocado, transdutores, gel condutor e materiais descartáveis.', 75, 1, 1200.00, 1200.00, 950.00, 220.00),
    ('Estética Facial', 'Tratamento para olheiras estéticas', 'Protocolo cosmético para hidratação, drenagem e luminosidade da região dos olhos. Materiais: dermocosméticos específicos, máscara periocular, massageador e protetor solar.', 45, 4, 210.00, 210.00, 170.00, 50.00),
    ('Estética Facial', 'Rejuvenescimento facial global', 'Combinação de limpeza, estímulo de colágeno e ativos antioxidantes. Materiais: kit facial, séruns, radiofrequência ou LED conforme avaliação, máscara e fotoproteção.', 90, 4, 360.00, 360.00, 300.00, 85.00),
    ('Peelings', 'Peeling químico clareador', 'Protocolo para manchas superficiais e uniformização do tom. Materiais: solução clareadora, neutralizante quando indicado, máscara calmante, luvas, pincel e filtro solar.', 45, 4, 260.00, 260.00, 210.00, 60.00),
    ('Peelings', 'Peeling antiacne', 'Tratamento para controle de oleosidade, comedões e acne leve. Materiais: ácidos seborreguladores, higienizante, máscara secativa, descartáveis e fotoproteção.', 45, 4, 240.00, 240.00, 195.00, 55.00),
    ('Peelings', 'Peeling de ácido glicólico', 'Renovação superficial para textura e luminosidade. Materiais: ácido glicólico, neutralizante, pincel, máscara calmante e filtro solar.', 40, 4, 220.00, 220.00, 180.00, 45.00),
    ('Peelings', 'Peeling de retinol', 'Renovação cutânea com foco em textura, linhas finas e viço. Materiais: retinol profissional, preparo de pele, máscara reparadora, luvas e orientações pós-procedimento.', 45, 3, 280.00, 280.00, 230.00, 70.00),
    ('Peelings', 'Peeling mandélico pele sensível', 'Renovação suave para peles sensíveis ou com tendência a irritação. Materiais: ácido mandélico, máscara calmante, água termal, gaze e protetor solar.', 40, 4, 230.00, 230.00, 190.00, 50.00),
    ('Peelings', 'Peeling tranexâmico para melasma', 'Protocolo estético para apoio ao clareamento de manchas. Materiais: ativo tranexâmico, veículo profissional, máscara calmante, pincel e fotoproteção.', 45, 4, 290.00, 290.00, 240.00, 75.00),
    ('Peelings', 'Peeling enzimático facial', 'Renovação suave sem ácidos agressivos, indicada para luminosidade. Materiais: enzimas profissionais, higienizante, máscara hidratante e protetor solar.', 40, 1, 190.00, 190.00, 150.00, 40.00),
    ('Peelings', 'Peeling corporal clareador', 'Protocolo para áreas corporais com hiperpigmentação estética. Materiais: solução corporal, luvas, pincel, hidratante reparador e orientação domiciliar.', 60, 4, 320.00, 320.00, 260.00, 85.00),
    ('Peelings', 'Peeling para poros dilatados', 'Protocolo para textura, oleosidade e aparência de poros. Materiais: ativos renovadores, máscara seborreguladora, gaze, pincel e filtro solar.', 45, 4, 240.00, 240.00, 195.00, 55.00),
    ('Peelings', 'Peeling glow', 'Peeling leve de luminosidade para eventos e manutenção. Materiais: blend iluminador, máscara hidratante, sérum glow e fotoproteção.', 40, 1, 210.00, 210.00, 170.00, 45.00),
    ('Celulite e Flacidez', 'Radiofrequência corporal', 'Tecnologia para flacidez corporal e estímulo de colágeno. Materiais: radiofrequência, gel condutor, fita métrica, descartáveis e finalizador corporal.', 60, 8, 260.00, 260.00, 210.00, 55.00),
    ('Celulite e Flacidez', 'Endermoterapia corporal', 'Massagem mecânica assistida para celulite e circulação. Materiais: aparelho de endermoterapia, malha individual, higienização e creme finalizador.', 50, 10, 220.00, 220.00, 180.00, 45.00),
    ('Celulite e Flacidez', 'Tratamento de celulite grau I e II', 'Protocolo combinado para celulite leve a moderada. Materiais: dermocosméticos lipolíticos, massagem modeladora, radiofrequência ou endermoterapia.', 60, 8, 240.00, 240.00, 195.00, 55.00),
    ('Celulite e Flacidez', 'Tratamento de celulite grau III', 'Protocolo intensivo com tecnologias e ativos para celulite avançada. Materiais: endermoterapia, radiofrequência, ativos corporais, descartáveis e avaliação periódica.', 75, 10, 320.00, 320.00, 260.00, 80.00),
    ('Celulite e Flacidez', 'Tratamento de flacidez abdominal', 'Tratamento para melhora visual de flacidez em abdômen. Materiais: radiofrequência, gel condutor, ativos firmadores, fita métrica e registros fotográficos.', 60, 8, 280.00, 280.00, 230.00, 65.00),
    ('Celulite e Flacidez', 'Protocolo glúteos firmes', 'Protocolo de estímulo e tonificação estética de glúteos. Materiais: pump, radiofrequência ou corrente, creme firmador, descartáveis e avaliação.', 60, 8, 290.00, 290.00, 240.00, 70.00),
    ('Celulite e Flacidez', 'Pump up glúteos', 'Sessão de vácuo para melhora temporária de contorno e aspecto dos glúteos. Materiais: equipamento pump, higienizante, descartáveis e creme finalizador.', 45, 6, 180.00, 180.00, 145.00, 35.00),
    ('Celulite e Flacidez', 'Microagulhamento para estrias', 'Estimulação estética para melhora de textura em estrias. Materiais: dermapen, cartucho estéril, antisséptico, sérum reparador, luvas e máscara.', 60, 4, 360.00, 360.00, 300.00, 90.00),
    ('Celulite e Flacidez', 'Drenomodeladora', 'Técnica manual combinando drenagem e modeladora corporal. Materiais: creme corporal, lençol descartável, luvas quando indicado e fita métrica.', 60, 6, 190.00, 190.00, 155.00, 30.00),
    ('Celulite e Flacidez', 'Protocolo pernas leves', 'Protocolo para sensação de peso, edema estético e circulação. Materiais: drenagem, criogel, bandagens frias, creme finalizador e descartáveis.', 50, 6, 180.00, 180.00, 145.00, 35.00),
    ('Emagrecimento', 'Avaliação corporal com bioimpedância', 'Avaliação de composição corporal para início e acompanhamento de protocolos. Materiais: bioimpedância, fita métrica, adipômetro quando indicado e ficha de avaliação.', 40, 1, 120.00, 120.00, 90.00, 20.00),
    ('Emagrecimento', 'Programa redução de medidas 4 semanas', 'Pacote de acompanhamento corporal com tecnologias e medidas semanais. Materiais: fita métrica, ativos corporais, radiofrequência/cavitação conforme avaliação e registros.', 60, 8, 1600.00, 1600.00, 1300.00, 320.00),
    ('Emagrecimento', 'Programa redução de medidas 8 semanas', 'Programa intensivo para redução de medidas com acompanhamento quinzenal. Materiais: avaliação corporal, tecnologias combinadas, ativos, descartáveis e relatório evolutivo.', 60, 16, 2800.00, 2800.00, 2300.00, 560.00),
    ('Emagrecimento', 'Ultrassom cavitacional', 'Tecnologia estética para gordura localizada conforme avaliação. Materiais: aparelho de cavitação, gel condutor, fita métrica, descartáveis e hidratação final.', 50, 8, 240.00, 240.00, 195.00, 50.00),
    ('Emagrecimento', 'Criolipólise abdômen', 'Sessão de criolipólise para abdômen conforme indicação e avaliação. Materiais: aparelho, manta anticongelante, gel, descartáveis e documentação fotográfica.', 75, 1, 850.00, 850.00, 700.00, 180.00),
    ('Emagrecimento', 'Criolipólise flancos', 'Sessão de criolipólise para flancos conforme indicação e avaliação. Materiais: aparelho, manta anticongelante, gel, descartáveis e acompanhamento.', 75, 1, 900.00, 900.00, 740.00, 190.00),
    ('Emagrecimento', 'Protocolo detox corporal', 'Protocolo corporal de drenagem, ativos e sudorese assistida. Materiais: argila ou ativos detox, manta térmica, filme osmótico, creme e descartáveis.', 70, 4, 260.00, 260.00, 210.00, 60.00),
    ('Emagrecimento', 'Manta térmica com ativos', 'Sessão de termoterapia associada a ativos corporais. Materiais: manta térmica, creme/gel ativo, filme osmótico, lençol descartável e hidratação.', 50, 6, 190.00, 190.00, 155.00, 40.00),
    ('Emagrecimento', 'Envoltório corporal redutor', 'Bandagem e ativos para protocolo estético de medidas. Materiais: bandagens, ativos redutores, filme osmótico, luvas e fita métrica.', 60, 6, 210.00, 210.00, 170.00, 50.00),
    ('Emagrecimento', 'Protocolo barriga zero', 'Protocolo combinado para abdômen com medidas e tecnologias. Materiais: cavitação ou radiofrequência, gel condutor, ativos corporais, fita métrica e descartáveis.', 60, 8, 290.00, 290.00, 240.00, 70.00)
),
target_clinics AS (
  SELECT id
  FROM public.clinics
  WHERE lower(name) LIKE '%clinica modelo%'
     OR lower(name) LIKE '%clínica modelo%'
),
target_categories AS (
  SELECT tc.id, tc.clinic_id, tc.name
  FROM public.treatment_categories tc
  JOIN target_clinics c ON c.id = tc.clinic_id
  WHERE tc.status = 'active'
)
INSERT INTO public.treatments (
  clinic_id,
  name,
  description,
  duration_minutes,
  num_sessions,
  price,
  category,
  category_id,
  default_price,
  min_price,
  cost,
  is_active
)
SELECT
  tc.clinic_id,
  catalog.name,
  catalog.description,
  catalog.duration_minutes,
  catalog.num_sessions,
  catalog.price,
  catalog.category_name,
  tc.id,
  catalog.default_price,
  catalog.min_price,
  catalog.cost,
  true
FROM catalog
JOIN target_categories tc ON tc.name = catalog.category_name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.treatments existing
  WHERE existing.clinic_id = tc.clinic_id
    AND existing.name = catalog.name
);
