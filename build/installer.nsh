; NSIS hook custom — laisse l'installeur Electron faire son travail standard,
; mais on s'assure que les raccourcis utilisent bien le nom du produit.
!macro customHeader
  RequestExecutionLevel user
!macroend
